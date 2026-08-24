import { prisma } from '@/infrastructure/database/client';
import {
  computeDispatchScore,
  loadOrderForDispatch,
  assignDriverToOrder,
  getDispatchCandidates,
  MAX_CONCURRENT_DELIVERIES,
} from './dispatch.service';
import { TERMINAL_STATUSES } from '@/modules/orders/order-state-machine';
import { queueAndSendNotification } from '@/modules/notifications/notifications.service';
import { getIneligibleOwnerIds } from '@/modules/documents/documents.service';
import type { DriverOffer } from '@prisma/client';

export class OfferError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'OfferError';
    this.statusCode = statusCode;
  }
}

/**
 * Durée de validité d'une offre avant expiration automatique — 90 secondes,
 * cohérent avec les standards du secteur (le livreur voit "Nouvelle mission"
 * avec un compte à rebours, pas un délai qui traîne).
 */
export const OFFER_TTL_SECONDS = 90;

/**
 * Une offre PENDING dont l'échéance est dépassée est traitée comme EXPIRED
 * dès sa prochaine lecture — pas de job cron nécessaire en V1 (cohérent avec
 * le choix "modular monolith, pas de complexité prématurée"). Persiste le
 * changement en base pour que l'état lu soit toujours celui affiché.
 */
async function materializeExpiry<T extends DriverOffer>(offer: T): Promise<T> {
  if (offer.status !== 'PENDING' || offer.expiresAt > new Date()) {
    return offer;
  }
  const updated = await prisma.driverOffer.update({ where: { id: offer.id }, data: { status: 'EXPIRED' } });
  return { ...offer, ...updated };
}

/**
 * Propose une mission à un livreur précis — ne l'assigne PAS immédiatement.
 * Le livreur doit accepter explicitement (voir acceptOffer). Un livreur ne
 * peut avoir qu'une offre PENDING à la fois : on ne le sollicite pas sur
 * plusieurs courses simultanément — même un livreur déjà BUSY (multi-arrêts)
 * ne reçoit qu'une seule proposition à la fois, jamais plusieurs en parallèle.
 */
export async function createOffer(orderId: string, driverId: string) {
  const order = await loadOrderForDispatch(orderId);
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });

  if (driver.status !== 'AVAILABLE' && driver.status !== 'BUSY') {
    throw new OfferError(`Le livreur ${driver.driverCode} n'est pas disponible (statut actuel : ${driver.status}).`);
  }

  if (driver.status === 'BUSY') {
    const activeLoad = await prisma.delivery.count({
      where: { driverId, order: { status: { notIn: TERMINAL_STATUSES } } },
    });
    if (activeLoad >= MAX_CONCURRENT_DELIVERIES) {
      throw new OfferError(
        `Le livreur ${driver.driverCode} a déjà ${activeLoad} livraisons actives (capacité maximale : ${MAX_CONCURRENT_DELIVERIES}).`
      );
    }
  }

  const ineligibleIds = await getIneligibleOwnerIds('DRIVER', [driverId]);
  if (ineligibleIds.has(driverId)) {
    throw new OfferError(`Le livreur ${driver.driverCode} n'est pas éligible : documents obligatoires manquants ou expirés.`);
  }

  const existingPending = await prisma.driverOffer.findFirst({
    where: { driverId, status: 'PENDING', expiresAt: { gt: new Date() } },
  });
  if (existingPending) {
    throw new OfferError(`Le livreur ${driver.driverCode} a déjà une offre en attente de réponse.`);
  }

  const { score } = await computeDispatchScore(driver, order);

  const offer = await prisma.driverOffer.create({
    data: {
      orderId,
      driverId,
      score,
      expiresAt: new Date(Date.now() + OFFER_TTL_SECONDS * 1000),
    },
  });

  await queueAndSendNotification({
    recipient: { userId: driver.userId },
    channel: 'PUSH',
    event: 'DELIVERY_OFFER',
    payload: { orderId, orderNumber: order.orderNumber, expiresInSeconds: OFFER_TTL_SECONDS },
  }).catch(() => {
    // Une notification qui échoue ne doit jamais empêcher l'offre d'exister
    // — le livreur peut toujours la voir dans son app au prochain rafraîchissement.
  });

  return offer;
}

/**
 * Accepte une offre : délègue à `assignDriverToOrder` (même logique déjà
 * testée que l'assignation directe — aucune règle métier dupliquée), puis
 * périme toute autre offre encore PENDING pour la même commande.
 */
export async function acceptOffer(offerId: string, context: { actorId?: string; actorRole?: string }) {
  const offer = await materializeExpiry(await prisma.driverOffer.findUniqueOrThrow({ where: { id: offerId } }));

  if (context.actorRole === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: context.actorId } });
    if (!driver || driver.id !== offer.driverId) {
      throw new OfferError("Cette offre n'est pas destinée à ce livreur.", 403);
    }
  }

  if (offer.status !== 'PENDING') {
    throw new OfferError(`Cette offre n'est plus disponible (statut : ${offer.status}).`);
  }

  const result = await assignDriverToOrder(offer.orderId, offer.driverId, { actorId: context.actorId });

  await prisma.driverOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });

  await prisma.driverOffer.updateMany({
    where: { orderId: offer.orderId, status: 'PENDING', id: { not: offer.id } },
    data: { status: 'EXPIRED', respondedAt: new Date() },
  });

  return result;
}

export async function rejectOffer(offerId: string, context: { actorId?: string; actorRole?: string }) {
  const offer = await materializeExpiry(await prisma.driverOffer.findUniqueOrThrow({ where: { id: offerId } }));

  if (context.actorRole === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: context.actorId } });
    if (!driver || driver.id !== offer.driverId) {
      throw new OfferError("Cette offre n'est pas destinée à ce livreur.", 403);
    }
  }

  if (offer.status !== 'PENDING') {
    throw new OfferError(`Cette offre n'est plus modifiable (statut : ${offer.status}).`);
  }

  return prisma.driverOffer.update({
    where: { id: offer.id },
    data: { status: 'REJECTED', respondedAt: new Date() },
  });
}

/**
 * Propose automatiquement au meilleur candidat qui n'a pas déjà refusé ou
 * laissé expirer une offre pour cette commande — fallback en cascade sans
 * jamais re-solliciter un livreur qui a déjà dit non.
 */
export async function offerToNextBestDriver(orderId: string) {
  const candidates = await getDispatchCandidates(orderId);

  const alreadyDeclined = await prisma.driverOffer.findMany({
    where: { orderId, status: { in: ['REJECTED', 'EXPIRED'] } },
    select: { driverId: true },
  });
  const declinedIds = new Set(alreadyDeclined.map((o) => o.driverId));

  const next = candidates.find((c) => !declinedIds.has(c.driverId));
  if (!next) {
    throw new OfferError('Aucun livreur disponible n\'a accepté — tous les candidats ont refusé ou expiré.', 404);
  }

  return createOffer(orderId, next.driverId);
}

export async function getMyPendingOffers(driverId: string) {
  const offers = await prisma.driverOffer.findMany({
    where: { driverId, status: 'PENDING' },
    include: {
      order: { include: { customer: true, address: true } },
    },
    orderBy: { offeredAt: 'desc' },
  });

  const now = new Date();
  const expiredIds = offers.filter((o) => o.expiresAt <= now).map((o) => o.id);
  if (expiredIds.length > 0) {
    await prisma.driverOffer.updateMany({ where: { id: { in: expiredIds } }, data: { status: 'EXPIRED' } });
  }

  return offers.filter((o) => o.expiresAt > now);
}
