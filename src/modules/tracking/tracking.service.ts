import { prisma } from '@/infrastructure/database/client';
import { SLA_MAX_MINUTES } from '@/modules/operations/exceptions.service';

export class TrackingError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 404) {
    super(message);
    this.name = 'TrackingError';
    this.statusCode = statusCode;
  }
}

// Même seuil que la fraîcheur de position utilisée côté carte opérationnelle
// interne (drivers.service.ts) — dupliqué plutôt qu'importé pour ne pas
// coupler le module de tracking public (aucune auth) au module livreurs.
const STALE_LOCATION_THRESHOLD_MS = 20 * 60_000;

/**
 * Vue de suivi public (lien `logiflow.com/track/:orderNumber`, section 15 du
 * plan produit). Volontairement minimale : ni téléphone, ni adresse postale,
 * ni données financières — seulement ce dont un client a besoin pour suivre
 * son colis, accessible sans authentification. La position du livreur n'est
 * exposée QUE pendant OUT_FOR_DELIVERY (pas avant, pas après) : c'est le seul
 * moment où elle a un sens pour le client, et ça limite la fenêtre
 * d'exposition d'une donnée par ailleurs déjà semi-publique (visible sur le
 * Control Tower interne). La destination n'est jamais renvoyée : le numéro de
 * commande est devinable/énumérable, on ne veut donc jamais qu'il permette de
 * retrouver l'adresse d'un client.
 */
export async function getPublicTracking(orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      statusHistory: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
      delivery: {
        select: {
          deliveredAt: true,
          driver: {
            select: {
              driverCode: true,
              vehicleType: true,
              currentLatitude: true,
              currentLongitude: true,
              lastLocationUpdate: true,
            },
          },
        },
      },
      review: { select: { rating: true, comment: true, createdAt: true } },
    },
  });

  if (!order) {
    throw new TrackingError('Commande introuvable.');
  }

  const outForDeliverySince = order.statusHistory.find((h) => h.toStatus === 'OUT_FOR_DELIVERY')?.createdAt;
  const etaMinutes = SLA_MAX_MINUTES.OUT_FOR_DELIVERY;
  const isOutForDelivery = order.status === 'OUT_FOR_DELIVERY';

  const driver = order.delivery?.driver;
  const hasFreshPosition =
    isOutForDelivery &&
    driver?.currentLatitude != null &&
    driver?.currentLongitude != null &&
    driver.lastLocationUpdate != null &&
    Date.now() - driver.lastLocationUpdate.getTime() < STALE_LOCATION_THRESHOLD_MS;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt,
    scheduledFor: order.scheduledFor,
    scheduledWindowMinutes: order.scheduledWindowMinutes,
    deliveredAt: order.delivery?.deliveredAt ?? null,
    driver: driver ? { code: driver.driverCode, vehicle: driver.vehicleType } : null,
    driverPosition: hasFreshPosition
      ? { lat: Number(driver!.currentLatitude), lng: Number(driver!.currentLongitude) }
      : null,
    eta: isOutForDelivery && outForDeliverySince && etaMinutes
      ? new Date(outForDeliverySince.getTime() + etaMinutes * 60_000).toISOString()
      : null,
    review: order.review,
    timeline: order.statusHistory.map((entry) => ({ status: entry.toStatus, at: entry.createdAt })),
  };
}

/**
 * Avis client post-livraison, depuis la page de suivi public — sans
 * authentification (même principe que le reste du tracking : le lien de
 * commande en tient lieu). Un seul avis par commande, et seulement une fois
 * DELIVERED : noter une commande encore en cours n'aurait pas de sens.
 */
export async function submitDeliveryReview(orderNumber: string, rating: number, comment?: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { delivery: { select: { driverId: true } }, review: true },
  });

  if (!order) {
    throw new TrackingError('Commande introuvable.');
  }
  if (order.status !== 'DELIVERED') {
    throw new TrackingError('Cette commande n\'est pas encore livrée.', 409);
  }
  if (order.review) {
    throw new TrackingError('Un avis a déjà été enregistré pour cette commande.', 409);
  }

  return prisma.deliveryReview.create({
    data: {
      orderId: order.id,
      driverId: order.delivery?.driverId ?? null,
      rating,
      comment,
    },
  });
}
