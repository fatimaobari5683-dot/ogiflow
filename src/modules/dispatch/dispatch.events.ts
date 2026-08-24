import { onDomainEvent } from '@/infrastructure/messaging/event-bus';
import { prisma } from '@/infrastructure/database/client';
import { releaseDriverIfIdle } from './dispatch.service';

/**
 * Quand une commande atteint un état terminal, le livreur qui la portait
 * redevient disponible s'il n'a plus aucune autre livraison active.
 * Enregistré une seule fois au démarrage — voir src/instrumentation.ts.
 */
export function registerDispatchEventHandlers() {
  const releaseDriverForOrder = async (payload: Record<string, unknown>) => {
    const orderId = payload.orderId as string;
    const delivery = await prisma.delivery.findUnique({ where: { orderId }, select: { driverId: true } });
    if (delivery?.driverId) {
      await releaseDriverIfIdle(delivery.driverId);
    }
  };

  onDomainEvent('ORDER_DELIVERED', releaseDriverForOrder);
  onDomainEvent('ORDER_RETURNED', releaseDriverForOrder);
  onDomainEvent('ORDER_CANCELLED', releaseDriverForOrder);
}
