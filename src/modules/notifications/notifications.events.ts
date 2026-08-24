import { onDomainEvent } from '@/infrastructure/messaging/event-bus';
import { prisma } from '@/infrastructure/database/client';
import { queueAndSendNotification } from './notifications.service';
import { SLA_MAX_MINUTES } from '@/modules/operations/exceptions.service';

async function loadOrderWithParties(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true, supplier: { include: { user: true } } },
  });
}

/**
 * Consomme les événements NOTIFY_CUSTOMER / NOTIFY_SUPPLIER déjà émis par la
 * state machine des commandes (voir order-state-machine.ts) pour
 * OUT_FOR_DELIVERY, DELIVERED, CUSTOMER_ABSENT, WRONG_ADDRESS, RETURNED,
 * CANCELLED. Enregistré une seule fois au démarrage — voir
 * src/instrumentation.ts.
 */
export function registerNotificationEventHandlers() {
  onDomainEvent('NOTIFY_CUSTOMER', async (payload) => {
    const order = await loadOrderWithParties(payload.orderId as string);
    // OUT_FOR_DELIVERY est le seul statut où le client attend concrètement
    // son colis "maintenant" : on y ajoute une heure d'arrivée estimée,
    // dérivée du même seuil SLA que le Control Tower utilise déjà pour
    // détecter les retards (voir exceptions.service.ts) — pas de moteur de
    // routage réel, mais un signal honnête et cohérent avec le reste du
    // système plutôt qu'une fausse précision inventée.
    const etaMinutes = order.status === 'OUT_FOR_DELIVERY' ? SLA_MAX_MINUTES.OUT_FOR_DELIVERY : undefined;
    const etaAt = etaMinutes ? new Date(order.updatedAt.getTime() + etaMinutes * 60_000) : undefined;

    await queueAndSendNotification({
      recipient: {
        userId: order.customer.userId ?? undefined,
        phone: order.customer.phone,
        email: order.customer.email ?? undefined,
      },
      channel: 'SMS',
      event: `ORDER_${order.status}`,
      payload: {
        orderNumber: order.orderNumber,
        status: order.status,
        ...(etaAt ? { etaAt: etaAt.toISOString() } : {}),
      },
    });
  });

  onDomainEvent('NOTIFY_SUPPLIER', async (payload) => {
    const order = await loadOrderWithParties(payload.orderId as string);
    await queueAndSendNotification({
      recipient: {
        userId: order.supplier.userId,
        phone: order.supplier.user.phone,
        email: order.supplier.user.email ?? undefined,
      },
      channel: 'EMAIL',
      event: `ORDER_${order.status}`,
      payload: { orderNumber: order.orderNumber, status: order.status },
    });
  });
}
