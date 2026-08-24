import { prisma } from '@/infrastructure/database/client';
import { haversineDistanceKm } from '@/shared/utils/geo';
import { transitionOrderStatus } from '@/modules/orders/orders.service';
import { TERMINAL_STATUSES } from '@/modules/orders/order-state-machine';
import { DEFAULT_SUCCESS_RATE_NEW_DRIVER } from '@/modules/drivers/drivers.service';
import { getIneligibleOwnerIds } from '@/modules/documents/documents.service';
import type { Driver, Order, Address } from '@prisma/client';

export class DispatchError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'DispatchError';
    this.statusCode = statusCode;
  }
}

/**
 * Pondération du score de dispatch (section 7 du plan produit) :
 *   Dispatch Score = distance + charge actuelle + zone + performance + disponibilité
 * La disponibilité est un pré-filtre (seuls les livreurs AVAILABLE sont candidats),
 * les quatre autres facteurs sont combinés en un score continu 0-100.
 */
const WEIGHTS = {
  distance: 0.4,
  load: 0.25,
  performance: 0.25,
  zone: 0.1,
};

const MAX_RELEVANT_DISTANCE_KM = 15;
const MAX_RELEVANT_LOAD = 5;
const CANDIDATE_POOL_LIMIT = 10;

/**
 * Nombre maximum de livraisons actives qu'un même livreur peut porter en
 * même temps (multi-arrêts, inspiré du groupage Uber Eats/Glovo) — un
 * livreur BUSY sous ce seuil reste candidat à une commande supplémentaire ;
 * au-delà, il redevient invisible au dispatch jusqu'à ce qu'une de ses
 * livraisons se termine. 3 correspond à ce qu'un deux-roues/voiture peut
 * raisonnablement porter en une tournée sans dégrader les délais.
 */
export const MAX_CONCURRENT_DELIVERIES = 3;

/**
 * Délai avant le début du créneau programmé à partir duquel le dispatch
 * devient possible — une commande programmée pour 14h ne doit pas immobiliser
 * un livreur dès 9h. Volontairement un simple garde-fou vérifié à chaque
 * tentative de dispatch, pas un déclenchement automatique à l'heure dite :
 * ce projet n'a pas de scheduler (même limite assumée que les webhooks,
 * voir webhooks.service.ts) — un opérateur ou l'auto-dispatch doit retenter
 * une fois le créneau de battement atteint.
 */
export const SCHEDULED_DISPATCH_LEAD_TIME_MINUTES = 60;

/**
 * Seuil de "position obsolète" (voir DriverLocationPing.tsx — le livreur
 * ping toutes les 60s tant qu'il est en ligne). Signal visible pour
 * l'opérateur uniquement — ne filtre PAS les candidats : le score de
 * dispatch et le statut AVAILABLE restent la source d'éligibilité réelle.
 * Exclure directement sur ce critère casserait le dispatch pour tout
 * livreur n'ayant jamais eu l'app ouverte depuis l'activation de ce
 * mécanisme (même risque déjà rencontré avec le garde-fou documentaire).
 */
const STALE_LOCATION_THRESHOLD_MS = 20 * 60_000;

export interface DispatchCandidate {
  driverId: string;
  driverCode: string;
  distanceKm: number | null;
  activeLoad: number;
  successRate: number;
  zoneMatch: boolean;
  score: number;
  locationStale: boolean;
}

export type OrderWithAddress = Order & { address: Address };

export async function computeDispatchScore(
  driver: Driver,
  order: OrderWithAddress
): Promise<Omit<DispatchCandidate, 'driverId' | 'driverCode'>> {
  const distanceKm =
    driver.currentLatitude != null &&
    driver.currentLongitude != null &&
    order.address.latitude != null &&
    order.address.longitude != null
      ? haversineDistanceKm(
          { lat: Number(driver.currentLatitude), lng: Number(driver.currentLongitude) },
          { lat: Number(order.address.latitude), lng: Number(order.address.longitude) }
        )
      : null;

  const [activeLoad, attemptStats, zoneMatch] = await Promise.all([
    prisma.delivery.count({ where: { driverId: driver.id, order: { status: { notIn: TERMINAL_STATUSES } } } }),
    prisma.deliveryAttempt.groupBy({ by: ['result'], where: { driverId: driver.id }, _count: true }),
    order.address.zoneId
      ? prisma.driverZone
          .findUnique({ where: { driverId_zoneId: { driverId: driver.id, zoneId: order.address.zoneId } } })
          .then(Boolean)
      : Promise.resolve(false),
  ]);

  const totalAttempts = attemptStats.reduce((sum, row) => sum + row._count, 0);
  const successfulAttempts = attemptStats.find((row) => row.result === 'SUCCESS')?._count ?? 0;
  const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : DEFAULT_SUCCESS_RATE_NEW_DRIVER;

  const distanceScore = distanceKm === null ? 50 : 100 * Math.max(0, 1 - distanceKm / MAX_RELEVANT_DISTANCE_KM);
  const loadScore = 100 * Math.max(0, 1 - activeLoad / MAX_RELEVANT_LOAD);
  const performanceScore = successRate * 100;
  const zoneScore = order.address.zoneId === null ? 50 : zoneMatch ? 100 : 0;

  const score =
    WEIGHTS.distance * distanceScore +
    WEIGHTS.load * loadScore +
    WEIGHTS.performance * performanceScore +
    WEIGHTS.zone * zoneScore;

  const locationStale =
    !driver.lastLocationUpdate || Date.now() - driver.lastLocationUpdate.getTime() > STALE_LOCATION_THRESHOLD_MS;

  return {
    distanceKm,
    activeLoad,
    successRate,
    zoneMatch,
    locationStale,
    score: Math.round(score * 100) / 100,
  };
}

export async function loadOrderForDispatch(orderId: string): Promise<OrderWithAddress> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { address: true } });
  if (order.status !== 'READY_FOR_PICKUP') {
    throw new DispatchError(
      `Dispatch impossible : la commande est au statut "${order.status}" (attendu : READY_FOR_PICKUP).`
    );
  }
  if (order.scheduledFor) {
    const dispatchOpensAt = new Date(order.scheduledFor.getTime() - SCHEDULED_DISPATCH_LEAD_TIME_MINUTES * 60_000);
    if (new Date() < dispatchOpensAt) {
      throw new DispatchError(
        `Livraison programmée à ${order.scheduledFor.toLocaleString('fr-FR')} — dispatch disponible à partir de ${dispatchOpensAt.toLocaleString('fr-FR')}.`
      );
    }
  }
  return order;
}

/**
 * Retourne les livreurs disponibles classés par score de dispatch décroissant.
 * Le responsable logistique choisit ensuite le livreur recommandé, ou un autre.
 *
 * "Le dispatch ne doit jamais décider seul" (Compliance Engine) : un livreur
 * AVAILABLE dont un document obligatoire est manquant ou expiré n'apparaît
 * même pas parmi les candidats — ce n'est pas au dispatcher de s'en rendre
 * compte après coup.
 *
 * Un livreur BUSY reste candidat (multi-arrêts) tant qu'il n'a pas atteint
 * MAX_CONCURRENT_DELIVERIES — `activeLoad`, déjà calculé par
 * computeDispatchScore, sert de filtre post-scoring plutôt que de refaire une
 * requête dédiée.
 */
export async function getDispatchCandidates(orderId: string): Promise<DispatchCandidate[]> {
  const order = await loadOrderForDispatch(orderId);
  const candidateDrivers = await prisma.driver.findMany({ where: { status: { in: ['AVAILABLE', 'BUSY'] } } });

  const ineligibleIds = await getIneligibleOwnerIds('DRIVER', candidateDrivers.map((d) => d.id));
  const eligibleDrivers = candidateDrivers.filter((d) => !ineligibleIds.has(d.id));

  const scored = await Promise.all(
    eligibleDrivers.map(async (driver) => ({
      driverId: driver.id,
      driverCode: driver.driverCode,
      ...(await computeDispatchScore(driver, order)),
    }))
  );

  return scored
    .filter((c) => c.activeLoad < MAX_CONCURRENT_DELIVERIES)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_POOL_LIMIT);
}

/**
 * Combien de livreurs AVAILABLE ont été silencieusement exclus de
 * `getDispatchCandidates` pour non-conformité documentaire — sert
 * uniquement à donner de la visibilité à l'opérateur (voir DispatchPanel),
 * jamais utilisé pour une décision de dispatch elle-même.
 */
export async function countIneligibleAvailableDrivers(): Promise<number> {
  const availableDrivers = await prisma.driver.findMany({ where: { status: 'AVAILABLE' }, select: { id: true } });
  const ineligibleIds = await getIneligibleOwnerIds('DRIVER', availableDrivers.map((d) => d.id));
  return ineligibleIds.size;
}

/**
 * Assigne un livreur précis à une commande : crée/actualise la livraison,
 * passe le livreur en BUSY, et transite la commande vers ASSIGNED via la
 * state machine (seul point d'entrée autorisé pour changer le statut).
 */
export async function assignDriverToOrder(orderId: string, driverId: string, context: { actorId?: string }) {
  const order = await loadOrderForDispatch(orderId);
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });

  if (driver.status !== 'AVAILABLE' && driver.status !== 'BUSY') {
    throw new DispatchError(
      `Le livreur ${driver.driverCode} n'est pas disponible (statut actuel : ${driver.status}).`
    );
  }

  // Un livreur BUSY peut recevoir un arrêt supplémentaire (multi-arrêts) tant
  // qu'il n'a pas atteint sa capacité — au-delà, ce n'est plus une tournée
  // raisonnable pour un deux-roues/voiture.
  if (driver.status === 'BUSY') {
    const activeLoad = await prisma.delivery.count({
      where: { driverId, order: { status: { notIn: TERMINAL_STATUSES } } },
    });
    if (activeLoad >= MAX_CONCURRENT_DELIVERIES) {
      throw new DispatchError(
        `Le livreur ${driver.driverCode} a déjà ${activeLoad} livraisons actives (capacité maximale : ${MAX_CONCURRENT_DELIVERIES}).`
      );
    }
  }

  // Même règle qu'un choix depuis la liste de candidats — une assignation
  // manuelle directe (un opérateur qui connaît déjà le driverId) ne doit pas
  // pouvoir contourner la conformité documentaire.
  const ineligibleIds = await getIneligibleOwnerIds('DRIVER', [driverId]);
  if (ineligibleIds.has(driverId)) {
    throw new DispatchError(
      `Le livreur ${driver.driverCode} n'est pas éligible : documents obligatoires manquants ou expirés.`,
      403
    );
  }

  const { distanceKm, score } = await computeDispatchScore(driver, order);

  await prisma.$transaction([
    prisma.delivery.upsert({
      where: { orderId },
      create: { orderId, driverId, assignedAt: new Date(), dispatchScore: score, distanceKm: distanceKm ?? undefined },
      update: { driverId, assignedAt: new Date(), dispatchScore: score, distanceKm: distanceKm ?? undefined },
    }),
    prisma.driver.update({ where: { id: driverId }, data: { status: 'BUSY' } }),
  ]);

  const updatedOrder = await transitionOrderStatus(orderId, 'ASSIGNED', {
    actorId: context.actorId,
    reason: `Livreur ${driver.driverCode} assigné (score dispatch : ${score.toFixed(1)}/100)`,
  });

  return { order: updatedOrder, driverId, driverCode: driver.driverCode, distanceKm, score };
}

/**
 * Sélectionne et assigne automatiquement le meilleur livreur disponible.
 */
export async function autoAssignBestDriver(orderId: string, context: { actorId?: string }) {
  const candidates = await getDispatchCandidates(orderId);
  const best = candidates[0];
  if (!best) {
    throw new DispatchError('Aucun livreur disponible pour cette commande.', 404);
  }
  return assignDriverToOrder(orderId, best.driverId, context);
}

/**
 * Libère un livreur (retour à AVAILABLE) une fois qu'il n'a plus aucune
 * livraison active — appelé par les handlers d'événements de fin de commande
 * (voir dispatch.events.ts).
 */
export async function releaseDriverIfIdle(driverId: string) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver || driver.status !== 'BUSY') return;

  const remainingLoad = await prisma.delivery.count({
    where: { driverId, order: { status: { notIn: TERMINAL_STATUSES } } },
  });

  if (remainingLoad === 0) {
    await prisma.driver.update({ where: { id: driverId }, data: { status: 'AVAILABLE' } });
  }
}
