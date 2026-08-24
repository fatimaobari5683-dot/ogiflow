import { prisma } from '@/infrastructure/database/client';
import { TERMINAL_STATUSES } from '@/modules/orders/order-state-machine';
import type { DriverStatus } from '@prisma/client';

export class DriverError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DriverError';
    this.statusCode = statusCode;
  }
}

const SELF_SERVICE_STATUSES: DriverStatus[] = ['AVAILABLE', 'OFFLINE'];

/**
 * Taux de réussite par défaut pour un livreur sans historique — évite de
 * pénaliser artificiellement les nouveaux livreurs dans le scoring de dispatch.
 */
export const DEFAULT_SUCCESS_RATE_NEW_DRIVER = 0.8;

/**
 * Bascule volontaire de disponibilité par le livreur lui-même.
 */
export async function setDriverAvailability(driverId: string, status: DriverStatus) {
  if (!SELF_SERVICE_STATUSES.includes(status)) {
    throw new DriverError(`Statut "${status}" non autorisé en libre-service (AVAILABLE ou OFFLINE uniquement).`);
  }

  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });

  if (driver.status === 'BUSY') {
    throw new DriverError('Impossible de changer de statut pendant une livraison en cours.', 409);
  }
  if (driver.status === 'SUSPENDED' || driver.status === 'PENDING_APPROVAL') {
    throw new DriverError(`Compte livreur au statut "${driver.status}" : contactez un responsable.`, 403);
  }

  return prisma.driver.update({ where: { id: driverId }, data: { status } });
}

export async function updateDriverLocation(driverId: string, latitude: number, longitude: number) {
  return prisma.driver.update({
    where: { id: driverId },
    data: { currentLatitude: latitude, currentLongitude: longitude, lastLocationUpdate: new Date() },
  });
}

export async function assignDriverToZone(driverId: string, zoneId: string) {
  return prisma.driverZone.upsert({
    where: { driverId_zoneId: { driverId, zoneId } },
    create: { driverId, zoneId },
    update: {},
  });
}

export async function removeDriverFromZone(driverId: string, zoneId: string) {
  await prisma.driverZone.deleteMany({ where: { driverId, zoneId } });
}

export async function getDriverByUserId(userId: string) {
  return prisma.driver.findUnique({
    where: { userId },
    include: { user: { select: { firstName: true, lastName: true, phone: true } } },
  });
}

export async function listDrivers(filter: { status?: DriverStatus; zoneId?: string } = {}) {
  return prisma.driver.findMany({
    where: {
      status: filter.status,
      zones: filter.zoneId ? { some: { zoneId: filter.zoneId } } : undefined,
    },
    include: {
      user: { select: { firstName: true, lastName: true, phone: true } },
      zones: { include: { zone: true } },
      baseZone: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// Doit rester égal au seuil utilisé pour `locationStale` dans
// dispatch.service.ts (dupliqué plutôt qu'importé pour éviter un cycle
// drivers.service.ts ↔ dispatch.service.ts — dispatch importe déjà depuis
// drivers).
const STALE_LOCATION_THRESHOLD_MS = 20 * 60_000;

export interface DriverLocationPoint {
  id: string;
  driverCode: string;
  status: DriverStatus;
  latitude: number | null;
  longitude: number | null;
  lastLocationUpdate: Date | null;
  stale: boolean;
  // true si la position vient de la zone déclarée à l'inscription (fallback),
  // pas d'un vrai ping GPS — la carte doit le montrer différemment plutôt que
  // de faire croire à une position réelle.
  approximate: boolean;
  firstName: string;
  lastName: string;
}

/**
 * Toutes les positions connues, pour la carte opérationnelle du Control
 * Tower — inclut PENDING_APPROVAL : un livreur qui vient de s'inscrire reste
 * un livreur "inscrit" et doit être visible (ex: repérer d'un coup d'œil
 * d'où viennent les nouvelles inscriptions), même s'il n'est pas encore
 * opérationnel. REJECTED/SUSPENDED restent exclus : ce sont des comptes
 * clos, pas des livreurs en attente. Un livreur qui n'a jamais pingé sa
 * position réelle (cas très courant juste après inscription — le ping ne
 * démarre qu'une fois AVAILABLE/BUSY) retombe sur le centre approximatif de
 * sa zone déclarée plutôt que de rester invisible.
 */
export async function listDriverLocations(): Promise<DriverLocationPoint[]> {
  const drivers = await prisma.driver.findMany({
    where: { status: { in: ['PENDING_APPROVAL', 'AVAILABLE', 'BUSY', 'OFFLINE'] } },
    select: {
      id: true,
      driverCode: true,
      status: true,
      currentLatitude: true,
      currentLongitude: true,
      lastLocationUpdate: true,
      baseZone: { select: { latitude: true, longitude: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });

  const now = Date.now();
  return drivers.map((d) => {
    const hasRealPosition = d.currentLatitude !== null && d.currentLongitude !== null;
    const zoneLat = d.baseZone?.latitude !== null && d.baseZone?.latitude !== undefined ? Number(d.baseZone.latitude) : null;
    const zoneLng = d.baseZone?.longitude !== null && d.baseZone?.longitude !== undefined ? Number(d.baseZone.longitude) : null;
    const canFallBackToZone = zoneLat !== null && zoneLng !== null;

    return {
      id: d.id,
      driverCode: d.driverCode,
      status: d.status,
      latitude: hasRealPosition ? Number(d.currentLatitude) : canFallBackToZone ? zoneLat : null,
      longitude: hasRealPosition ? Number(d.currentLongitude) : canFallBackToZone ? zoneLng : null,
      lastLocationUpdate: d.lastLocationUpdate,
      stale: hasRealPosition
        ? !d.lastLocationUpdate || now - d.lastLocationUpdate.getTime() > STALE_LOCATION_THRESHOLD_MS
        : true,
      approximate: !hasRealPosition && canFallBackToZone,
      firstName: d.user.firstName,
      lastName: d.user.lastName,
    };
  });
}

export type DriverTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

/**
 * Niveaux de performance — inspiré des paliers Uber Pro / Grab Rewards :
 * un signal de reconnaissance basé sur le volume ET la qualité (jamais l'un
 * sans l'autre, pour ne pas récompenser un gros volume mal noté). Purement
 * informatif, comme la note moyenne dont il dérive — n'entre pas dans le
 * scoring de dispatch (même discipline que zoneMatch/locationStale).
 */
const TIER_THRESHOLDS: { tier: DriverTier; minDeliveries: number; minRating: number }[] = [
  { tier: 'PLATINUM', minDeliveries: 100, minRating: 4.8 },
  { tier: 'GOLD', minDeliveries: 50, minRating: 4.5 },
  { tier: 'SILVER', minDeliveries: 20, minRating: 4.0 },
];

export function computeDriverTier(successfulDeliveries: number, averageRating: number | null): DriverTier {
  if (averageRating === null) return 'BRONZE';
  const match = TIER_THRESHOLDS.find((t) => successfulDeliveries >= t.minDeliveries && averageRating >= t.minRating);
  return match?.tier ?? 'BRONZE';
}

export interface DriverPerformance {
  totalAttempts: number;
  successfulAttempts: number;
  successRate: number;
  failureRate: number;
  activeDeliveries: number;
  deliveredLast7Days: number;
  cashCollected: number;
  walletBalance: number;
  averageRating: number | null;
  reviewCount: number;
  tier: DriverTier;
}

export async function getDriverPerformance(driverId: string): Promise<DriverPerformance> {
  const [totalAttempts, successfulAttempts, activeDeliveries, deliveredLast7Days, codAggregate, driver, ratingAggregate] =
    await Promise.all([
      prisma.deliveryAttempt.count({ where: { driverId } }),
      prisma.deliveryAttempt.count({ where: { driverId, result: 'SUCCESS' } }),
      prisma.delivery.count({ where: { driverId, order: { status: { notIn: TERMINAL_STATUSES } } } }),
      prisma.delivery.count({
        where: { driverId, deliveredAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      }),
      prisma.payment.aggregate({
        where: { collectedById: driverId, status: { in: ['COLLECTED', 'CONFIRMED'] } },
        _sum: { amount: true },
      }),
      prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { walletBalance: true } }),
      // Purement informatif — n'entre pas dans le scoring de dispatch (même
      // discipline que zoneMatch/locationStale : un signal visible, jamais
      // un filtre caché).
      prisma.deliveryReview.aggregate({ where: { driverId }, _avg: { rating: true }, _count: true }),
    ]);

  const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : DEFAULT_SUCCESS_RATE_NEW_DRIVER;

  return {
    totalAttempts,
    successfulAttempts,
    successRate,
    failureRate: 1 - successRate,
    activeDeliveries,
    deliveredLast7Days,
    cashCollected: Number(codAggregate._sum.amount ?? 0),
    walletBalance: Number(driver.walletBalance),
    averageRating: ratingAggregate._avg.rating,
    reviewCount: ratingAggregate._count,
    tier: computeDriverTier(successfulAttempts, ratingAggregate._avg.rating),
  };
}

export interface LeaderboardEntry {
  driverId: string;
  driverCode: string;
  firstName: string;
  lastNameInitial: string;
  city: string | null;
  tier: DriverTier;
  deliveries: number;
  averageRating: number | null;
  rank: number;
}

/**
 * Classement des livreurs — inspiré des récompenses Uber Pro/Grab :
 * uniquement informatif, jamais consulté par le dispatch (même discipline
 * que le palier dont il affiche le badge). Classé par nombre de livraisons
 * RÉUSSIES sur la période (semaine/mois glissant), note moyenne en
 * départage — mais le badge de palier affiché reste le palier réel du
 * livreur (calculé sur tout son historique, comme partout ailleurs dans
 * l'app), pas un palier recalculé sur la seule période affichée : changer
 * de période ne doit jamais faire "changer de palier" sous les yeux du
 * livreur, ce serait incohérent avec ce qu'il voit sur /earnings.
 */
export async function getDriverLeaderboard(period: 'WEEK' | 'MONTH'): Promise<LeaderboardEntry[]> {
  const since = new Date(Date.now() - (period === 'WEEK' ? 7 : 30) * 86_400_000);

  const drivers = await prisma.driver.findMany({
    where: { status: { notIn: ['REJECTED', 'SUSPENDED', 'PENDING_APPROVAL'] } },
    select: {
      id: true,
      driverCode: true,
      user: { select: { firstName: true, lastName: true } },
      baseZone: { select: { city: true } },
    },
  });
  const driverIds = drivers.map((d) => d.id);

  const [periodDeliveries, periodRatings, lifetimeSuccesses, lifetimeRatings] = await Promise.all([
    prisma.delivery.groupBy({ by: ['driverId'], where: { driverId: { in: driverIds }, deliveredAt: { gte: since } }, _count: true }),
    prisma.deliveryReview.groupBy({ by: ['driverId'], where: { driverId: { in: driverIds }, createdAt: { gte: since } }, _avg: { rating: true } }),
    prisma.deliveryAttempt.groupBy({ by: ['driverId'], where: { driverId: { in: driverIds }, result: 'SUCCESS' }, _count: true }),
    prisma.deliveryReview.groupBy({ by: ['driverId'], where: { driverId: { in: driverIds } }, _avg: { rating: true } }),
  ]);

  const periodDeliveryCount = new Map(periodDeliveries.map((d) => [d.driverId, d._count]));
  const periodRatingByDriver = new Map(periodRatings.map((r) => [r.driverId, r._avg.rating]));
  const lifetimeSuccessCount = new Map(lifetimeSuccesses.map((d) => [d.driverId, d._count]));
  const lifetimeRatingByDriver = new Map(lifetimeRatings.map((r) => [r.driverId, r._avg.rating]));

  return drivers
    .map((d) => ({
      driverId: d.id,
      driverCode: d.driverCode,
      firstName: d.user.firstName,
      lastNameInitial: d.user.lastName.trim().charAt(0).toUpperCase() + '.',
      city: d.baseZone?.city ?? null,
      tier: computeDriverTier(lifetimeSuccessCount.get(d.id) ?? 0, lifetimeRatingByDriver.get(d.id) ?? null),
      deliveries: periodDeliveryCount.get(d.id) ?? 0,
      averageRating: periodRatingByDriver.get(d.id) ?? null,
    }))
    .filter((entry) => entry.deliveries > 0)
    .sort((a, b) => b.deliveries - a.deliveries || (b.averageRating ?? 0) - (a.averageRating ?? 0))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function getDriverProfile(driverId: string) {
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    include: {
      user: { select: { firstName: true, lastName: true, phone: true, email: true } },
      zones: { include: { zone: true } },
      baseZone: true,
    },
  });
  const performance = await getDriverPerformance(driverId);
  return { ...driver, performance };
}
