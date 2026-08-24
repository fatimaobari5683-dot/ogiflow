import { Prisma } from '@prisma/client';
import type { Delivery, OrderStatus, DeliveryAttemptResult } from '@prisma/client';
import { prisma } from '@/infrastructure/database/client';
import { transitionOrderStatus } from '@/modules/orders/orders.service';
import { TERMINAL_STATUSES } from '@/modules/orders/order-state-machine';
import { sequenceByNearestNeighbor } from '@/shared/utils/geo';

export class DeliveryError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DeliveryError';
    this.statusCode = statusCode;
  }
}

export interface ActorContext {
  actorId?: string;
  actorRole?: string;
}

interface GeoContext {
  latitude?: number;
  longitude?: number;
}

const MANUAL_TRANSIT_STATUSES: OrderStatus[] = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];
const RESOLUTION_STATUSES: OrderStatus[] = ['RESCHEDULED', 'RETURNED'];

const EVENT_TYPE_FOR_STATUS: Partial<Record<OrderStatus, string>> = {
  PICKED_UP: 'PICKUP_COMPLETED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
};

/**
 * Un échec non qualifié (OTHER_FAILURE) est traité comme une reprogrammation
 * plutôt qu'un échec définitif — évite de perdre une commande sur un incident
 * ponctuel (ex: circulation, colis endommagé en route).
 */
const ATTEMPT_RESULT_TO_ORDER_STATUS: Record<DeliveryAttemptResult, OrderStatus> = {
  SUCCESS: 'DELIVERED',
  CUSTOMER_ABSENT: 'CUSTOMER_ABSENT',
  WRONG_ADDRESS: 'WRONG_ADDRESS',
  CUSTOMER_REFUSED: 'CUSTOMER_REFUSED',
  OTHER_FAILURE: 'RESCHEDULED',
};

type OwnedDelivery = Delivery & { driverId: string };

// Exportées pour réutilisation par order-chat.service.ts — même vérification
// de propriété que pour les transitions de statut, pas de logique dupliquée
// pour une question aussi sensible (IDOR).
export async function getDeliveryForOrder(orderId: string): Promise<OwnedDelivery> {
  const delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery || !delivery.driverId) {
    throw new DeliveryError('Aucun livreur assigné à cette commande.', 404);
  }
  return delivery as OwnedDelivery;
}

/**
 * Un manager peut agir sur n'importe quelle livraison (correction, litige).
 * Un livreur ne peut agir que sur ses propres livraisons — vérifié ici plutôt
 * que de faire confiance à un `driverId` transmis par l'appelant.
 */
export async function assertDeliveryOwnership(delivery: OwnedDelivery, actor: ActorContext): Promise<void> {
  if (actor.actorRole !== 'DRIVER') return;

  const driver = await prisma.driver.findUnique({ where: { userId: actor.actorId }, select: { id: true } });
  if (!driver || driver.id !== delivery.driverId) {
    throw new DeliveryError("Cette livraison n'est pas assignée à ce livreur.", 403);
  }
}

/**
 * Fait avancer la commande d'une étape manuelle de transit (récupération,
 * en transit, en cours de livraison). Réutilise la state machine des
 * commandes pour la validation — aucune règle de transition dupliquée ici.
 */
export async function advanceDeliveryStatus(
  orderId: string,
  toStatus: OrderStatus,
  context: ActorContext & GeoContext
) {
  if (!MANUAL_TRANSIT_STATUSES.includes(toStatus)) {
    throw new DeliveryError(`Transition "${toStatus}" non gérée par advanceDeliveryStatus.`);
  }

  const delivery = await getDeliveryForOrder(orderId);
  await assertDeliveryOwnership(delivery, context);

  const updatedOrder = await transitionOrderStatus(orderId, toStatus, {
    actorId: context.actorId,
    reason: `Mise à jour statut livraison : ${toStatus}`,
  });

  if (toStatus === 'PICKED_UP') {
    await prisma.delivery.update({ where: { id: delivery.id }, data: { pickedUpAt: new Date() } });
  }

  await prisma.deliveryEvent.create({
    data: {
      deliveryId: delivery.id,
      eventType: EVENT_TYPE_FOR_STATUS[toStatus]!,
      latitude: context.latitude,
      longitude: context.longitude,
    },
  });

  return updatedOrder;
}

interface RecordAttemptOptions extends ActorContext, GeoContext {
  result: DeliveryAttemptResult;
  notes?: string;
  proof?: { type: 'SIGNATURE' | 'OTP' | 'PHOTO' | 'GPS'; data: Record<string, unknown> };
}

/**
 * Enregistre une tentative de livraison. En cas de succès, exige et persiste
 * la preuve de livraison (POD — signature, OTP, photo ou GPS) avant de
 * transiter la commande vers DELIVERED.
 */
export async function recordDeliveryAttempt(orderId: string, options: RecordAttemptOptions) {
  const delivery = await getDeliveryForOrder(orderId);
  await assertDeliveryOwnership(delivery, options);

  if (options.result === 'SUCCESS' && !options.proof) {
    throw new DeliveryError('Une preuve de livraison (POD) est requise pour confirmer une livraison réussie.', 422);
  }

  const attemptNumber = (await prisma.deliveryAttempt.count({ where: { deliveryId: delivery.id } })) + 1;

  await prisma.deliveryAttempt.create({
    data: {
      deliveryId: delivery.id,
      driverId: delivery.driverId,
      attemptNumber,
      result: options.result,
      notes: options.notes,
    },
  });

  await prisma.deliveryEvent.create({
    data: {
      deliveryId: delivery.id,
      eventType: `DELIVERY_ATTEMPT_${options.result}`,
      latitude: options.latitude,
      longitude: options.longitude,
      metadata: { attemptNumber, notes: options.notes ?? null } as Prisma.InputJsonValue,
    },
  });

  if (options.result === 'SUCCESS') {
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        deliveredAt: new Date(),
        proofType: options.proof!.type,
        proofData: options.proof!.data as Prisma.InputJsonValue,
      },
    });
  }

  const toStatus = ATTEMPT_RESULT_TO_ORDER_STATUS[options.result];
  return transitionOrderStatus(orderId, toStatus, {
    actorId: options.actorId,
    reason:
      options.result === 'SUCCESS'
        ? 'Livraison confirmée avec preuve de livraison (POD)'
        : `Tentative échouée (#${attemptNumber}) : ${options.result}${options.notes ? ` — ${options.notes}` : ''}`,
  });
}

/**
 * Journalise un événement de tracking temps réel (ex: ARRIVED_IN_ZONE) sans
 * changer le statut de la commande — alimente la carte live et l'audit.
 */
export async function recordDeliveryEvent(
  orderId: string,
  eventType: string,
  context: ActorContext & GeoContext & { metadata?: Record<string, unknown> }
) {
  const delivery = await getDeliveryForOrder(orderId);
  await assertDeliveryOwnership(delivery, context);

  return prisma.deliveryEvent.create({
    data: {
      deliveryId: delivery.id,
      eventType,
      latitude: context.latitude,
      longitude: context.longitude,
      metadata: context.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Dispositionne une livraison après un échec (CUSTOMER_ABSENT, WRONG_ADDRESS...) :
 * soit reprogrammée pour une nouvelle tentative, soit retournée au fournisseur.
 */
export async function resolveFailedDelivery(
  orderId: string,
  toStatus: OrderStatus,
  context: ActorContext & { reason?: string }
) {
  if (!RESOLUTION_STATUSES.includes(toStatus)) {
    throw new DeliveryError(`Résolution "${toStatus}" non supportée (RESCHEDULED ou RETURNED uniquement).`);
  }

  const delivery = await getDeliveryForOrder(orderId);
  await assertDeliveryOwnership(delivery, context);

  return transitionOrderStatus(orderId, toStatus, {
    actorId: context.actorId,
    reason: context.reason ?? `Livraison ${toStatus === 'RETURNED' ? 'retournée' : 'reprogrammée'}`,
  });
}

/**
 * Missions actives du livreur (utilisé par l'app livreur) : toutes les
 * livraisons qui lui sont assignées et dont la commande n'est pas encore
 * dans un état terminal — ordonnées par plus proche voisin successif depuis
 * sa position actuelle plutôt que par simple ordre d'assignation (multi-arrêts,
 * voir MAX_CONCURRENT_DELIVERIES dans dispatch.service.ts) : un livreur qui
 * porte 2-3 courses doit voir un ordre de tournée sensé, pas l'ordre dans
 * lequel elles lui ont été proposées.
 */
export async function getMyMissions(driverId: string) {
  const [driver, deliveries] = await Promise.all([
    prisma.driver.findUnique({ where: { id: driverId }, select: { currentLatitude: true, currentLongitude: true } }),
    prisma.delivery.findMany({
      where: { driverId, order: { status: { notIn: TERMINAL_STATUSES } } },
      include: {
        order: {
          include: { customer: true, address: true, items: { include: { product: true } } },
        },
      },
      orderBy: { assignedAt: 'asc' },
    }),
  ]);

  const start =
    driver?.currentLatitude != null && driver?.currentLongitude != null
      ? { lat: Number(driver.currentLatitude), lng: Number(driver.currentLongitude) }
      : null;

  return sequenceByNearestNeighbor(start, deliveries, (delivery) =>
    delivery.order.address.latitude != null && delivery.order.address.longitude != null
      ? { lat: Number(delivery.order.address.latitude), lng: Number(delivery.order.address.longitude) }
      : null
  );
}

export async function getDeliveryDetail(orderId: string, context: ActorContext) {
  const delivery = await prisma.delivery.findUnique({
    where: { orderId },
    include: {
      driver: { select: { id: true, driverCode: true, vehicleType: true, userId: true } },
      attempts: { orderBy: { attemptNumber: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!delivery) {
    throw new DeliveryError('Aucune livraison associée à cette commande.', 404);
  }

  if (context.actorRole === 'DRIVER' && delivery.driver?.userId !== context.actorId) {
    throw new DeliveryError("Cette livraison n'est pas assignée à ce livreur.", 403);
  }

  return delivery;
}
