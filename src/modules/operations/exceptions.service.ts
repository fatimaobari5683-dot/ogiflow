import { prisma } from '@/infrastructure/database/client';
import { TERMINAL_STATUSES } from '@/modules/orders/order-state-machine';
import { getDeliveryForOrder, assertDeliveryOwnership } from '@/modules/deliveries/deliveries.service';
import type { Exception, ExceptionSeverity, ExceptionType, OrderStatus } from '@prisma/client';

export class ExceptionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'ExceptionError';
    this.statusCode = statusCode;
  }
}

/**
 * Seuils SLA par étape — constantes de code volontairement, pas de moteur de
 * règles configurable en V1 (cohérent avec le choix "pas de complexité
 * prématurée" déjà appliqué au dispatch et aux offres). AT_RISK se déclenche
 * à 70% du seuil, BREACHED au-delà de 100%.
 */
export const SLA_MAX_MINUTES: Partial<Record<OrderStatus, number>> = {
  READY_FOR_PICKUP: 15, // en attente d'affectation d'un livreur
  ASSIGNED: 15, // affecté mais pas encore récupéré
  PICKED_UP: 10, // récupéré mais transit pas encore démarré
  IN_TRANSIT: 30,
  OUT_FOR_DELIVERY: 45,
};
const AT_RISK_RATIO = 0.7;

const REPEATED_FAILURE_THRESHOLD = 2;

// Types que CE balayage détecte et peut donc légitimement auto-résoudre.
// DRIVER_SOS n'y figure pas volontairement : sans cette liste, la ligne
// `toAutoResolve` ci-dessous résoudrait AUTOMATIQUEMENT n'importe quelle
// exception d'un type qu'elle ne gère pas dès le prochain appel — une alerte
// de sécurité levée par un livreur serait refermée toute seule à la
// prochaine ouverture du Control Tower (bug trouvé en préparant l'ajout de
// DRIVER_SOS, avant qu'il ne cause de dégât réel).
const AUTO_DETECTED_TYPES: ExceptionType[] = ['SLA_AT_RISK', 'SLA_BREACHED', 'REPEATED_FAILURE'];

/**
 * Détecte les anomalies actives (dépassements SLA, échecs répétés) et
 * synchronise la table `exceptions` : crée les nouvelles, laisse intactes
 * celles déjà ouvertes, résout automatiquement celles dont la commande a
 * progressé au-delà de l'état qui les avait déclenchées. Appelé à la lecture
 * du Control Tower — pas de job cron (même choix que l'expiration des offres).
 */
export async function detectAndSyncExceptions(): Promise<void> {
  const now = new Date();

  // Le SLA n'est évalué que sur les 5 étapes suivies ; les échecs répétés,
  // eux, doivent rester visibles même si la commande est retombée dans un
  // statut d'incident (CUSTOMER_ABSENT, RESCHEDULED…) en attendant une
  // décision manager — d'où un périmètre "non terminal" plus large ici.
  const [activeOrders, openExceptions] = await Promise.all([
    prisma.order.findMany({
      where: { status: { notIn: TERMINAL_STATUSES } },
      include: {
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 },
        delivery: { include: { attempts: true } },
      },
    }),
    prisma.exception.findMany({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
  ]);

  const openByOrderAndType = new Map<string, Exception>();
  for (const exception of openExceptions) {
    openByOrderAndType.set(`${exception.orderId}:${exception.type}`, exception);
  }

  const stillTriggered = new Set<string>();

  for (const order of activeOrders) {
    const maxMinutes = SLA_MAX_MINUTES[order.status];
    if (maxMinutes) {
      const enteredAt = order.statusHistory[0]?.createdAt ?? order.updatedAt;
      const elapsedMinutes = (now.getTime() - enteredAt.getTime()) / 60_000;

      if (elapsedMinutes >= maxMinutes) {
        const key = `${order.id}:SLA_BREACHED`;
        stillTriggered.add(key);
        await upsertException(order.id, 'SLA_BREACHED', 'CRITICAL',
          `Commande ${order.orderNumber} bloquée en statut ${order.status} depuis ${Math.round(elapsedMinutes)} min (seuil : ${maxMinutes} min).`,
          openByOrderAndType.get(key));
      } else if (elapsedMinutes >= maxMinutes * AT_RISK_RATIO) {
        const key = `${order.id}:SLA_AT_RISK`;
        stillTriggered.add(key);
        await upsertException(order.id, 'SLA_AT_RISK', 'MEDIUM',
          `Commande ${order.orderNumber} en statut ${order.status} depuis ${Math.round(elapsedMinutes)} min (seuil : ${maxMinutes} min).`,
          openByOrderAndType.get(key));
      }
    }

    const failedAttempts = order.delivery?.attempts.filter((a) => a.result !== 'SUCCESS').length ?? 0;
    if (failedAttempts >= REPEATED_FAILURE_THRESHOLD) {
      const key = `${order.id}:REPEATED_FAILURE`;
      stillTriggered.add(key);
      await upsertException(order.id, 'REPEATED_FAILURE', 'HIGH',
        `Commande ${order.orderNumber} : ${failedAttempts} tentatives de livraison échouées.`,
        openByOrderAndType.get(key));
    }
  }

  // Auto-résolution : toute exception AUTO-DÉTECTÉE encore OPEN/ACKNOWLEDGED
  // dont la condition ne s'est plus reproduite lors de ce balayage (la
  // commande a progressé, ou n'est plus dans un statut suivi de SLA). Les
  // types hors AUTO_DETECTED_TYPES (ex: DRIVER_SOS) ne sont jamais touchés
  // ici — seule une action humaine explicite (acknowledgeException /
  // resolveException) peut les clore.
  const toAutoResolve = openExceptions.filter(
    (e) => AUTO_DETECTED_TYPES.includes(e.type) && !stillTriggered.has(`${e.orderId}:${e.type}`)
  );
  if (toAutoResolve.length > 0) {
    await prisma.exception.updateMany({
      where: { id: { in: toAutoResolve.map((e) => e.id) } },
      data: { status: 'RESOLVED', resolvedAt: now, resolution: 'Résolu automatiquement — la commande a progressé.' },
    });
  }
}

async function upsertException(
  orderId: string,
  type: ExceptionType,
  severity: ExceptionSeverity,
  description: string,
  existing: Exception | undefined
): Promise<void> {
  if (existing) {
    if (existing.description !== description || existing.severity !== severity) {
      await prisma.exception.update({ where: { id: existing.id }, data: { description, severity } });
    }
    return;
  }
  await prisma.exception.create({ data: { orderId, type, severity, description } });
}

export interface ListExceptionsParams {
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
}

export async function listExceptions(params: ListExceptionsParams = {}) {
  await detectAndSyncExceptions();

  return prisma.exception.findMany({
    where: { status: params.status ?? { in: ['OPEN', 'ACKNOWLEDGED'] } },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          supplier: { select: { companyName: true } },
          delivery: { select: { driver: { select: { driverCode: true, user: { select: { firstName: true, lastName: true, phone: true } } } } } },
        },
      },
      acknowledgedBy: { select: { firstName: true, lastName: true } },
      resolvedBy: { select: { firstName: true, lastName: true } },
    },
    // SOS toujours en tête, avant même le tri par sévérité habituel — une
    // urgence sécurité ne doit jamais se retrouver noyée sous une pile de
    // SLA dépassés, même si ceux-ci sont eux aussi marqués CRITICAL.
    orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
  }).then((exceptions) => [
    ...exceptions.filter((e) => e.type === 'DRIVER_SOS'),
    ...exceptions.filter((e) => e.type !== 'DRIVER_SOS'),
  ]);
}

/**
 * Alerte d'urgence déclenchée par le livreur depuis sa mission — inspiré du
 * bouton SOS Uber/Lyft/Grab. Toujours CRITICAL, jamais auto-résolue (voir
 * AUTO_DETECTED_TYPES) : seule une prise en charge humaine explicite peut la
 * clore. Un livreur ne peut déclencher une alerte que sur sa propre
 * livraison — même vérification de propriété que le reste (IDOR).
 */
export async function triggerDriverSos(orderId: string, note: string | undefined, actor: { actorId?: string; actorRole?: string }) {
  const delivery = await getDeliveryForOrder(orderId);
  await assertDeliveryOwnership(delivery, actor);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } });

  return prisma.exception.create({
    data: {
      orderId,
      type: 'DRIVER_SOS',
      severity: 'CRITICAL',
      description: note?.trim()
        ? `Alerte SOS déclenchée par le livreur sur ${order.orderNumber} : ${note.trim()}`
        : `Alerte SOS déclenchée par le livreur sur ${order.orderNumber} — aucun détail fourni.`,
    },
  });
}

export async function acknowledgeException(exceptionId: string, actorId: string) {
  const exception = await prisma.exception.findUniqueOrThrow({ where: { id: exceptionId } });
  if (exception.status !== 'OPEN') {
    throw new ExceptionError(`Cette exception est déjà "${exception.status}".`);
  }
  return prisma.exception.update({
    where: { id: exceptionId },
    data: { status: 'ACKNOWLEDGED', acknowledgedById: actorId, acknowledgedAt: new Date() },
  });
}

export async function resolveException(exceptionId: string, actorId: string, resolution: string) {
  const exception = await prisma.exception.findUniqueOrThrow({ where: { id: exceptionId } });
  if (exception.status === 'RESOLVED') {
    throw new ExceptionError('Cette exception est déjà résolue.');
  }
  return prisma.exception.update({
    where: { id: exceptionId },
    data: { status: 'RESOLVED', resolvedById: actorId, resolvedAt: new Date(), resolution },
  });
}
