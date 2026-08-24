import { onDomainEvent } from '@/infrastructure/messaging/event-bus';
import { prisma } from '@/infrastructure/database/client';
import { processDriverReferralMilestone } from './referrals.service';

/**
 * Écoute la même transition ORDER_DELIVERED que le traitement du COD
 * (payments.events.ts) pour vérifier, à chaque livraison réussie, si elle
 * fait franchir au livreur le seuil de parrainage. `processDriverReferralMilestone`
 * ressort immédiatement (no-op) si le livreur n'a pas été parrainé ou si la
 * prime a déjà été versée — sans coût pour l'immense majorité des livraisons.
 */
export function registerDriverReferralEventHandlers() {
  onDomainEvent('ORDER_DELIVERED', async (payload) => {
    const orderId = payload.orderId as string;
    const delivery = await prisma.delivery.findUnique({ where: { orderId }, select: { driverId: true } });
    if (delivery?.driverId) {
      await processDriverReferralMilestone(delivery.driverId, orderId);
    }
  });
}
