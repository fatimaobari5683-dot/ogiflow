import { onDomainEvent } from '@/infrastructure/messaging/event-bus';
import { sendWebhook } from './webhooks.service';
import type { Order } from '@prisma/client';

// Sous-ensemble des événements domaine (order-state-machine.ts) réellement
// pertinents pour un système externe qui suit le cycle de vie d'une
// commande — pas les événements purement internes (calcul de commission,
// mise à jour d'analytics...).
const SUPPLIER_RELEVANT_EVENTS = [
  'ORDER_CONFIRMED',
  'DRIVER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'FAILED_DELIVERY',
  'ORDER_RETURNED',
  'ORDER_CANCELLED',
];

/**
 * Notifie le webhook du fournisseur à chaque changement de statut pertinent.
 * `sendWebhook` est un no-op silencieux si aucun webhook n'est configuré, et
 * gère elle-même ses tentatives/l'enregistrement de l'échec — un handler qui
 * échoue ici n'interrompt jamais les autres (voir event-bus.ts,
 * Promise.allSettled). Enregistré une seule fois au démarrage — voir
 * src/instrumentation.ts.
 */
export function registerWebhookEventHandlers() {
  for (const eventName of SUPPLIER_RELEVANT_EVENTS) {
    onDomainEvent(eventName, async (payload) => {
      const order = payload.order as Order | undefined;
      if (!order) return;
      await sendWebhook(order.supplierId, eventName, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
      });
    });
  }
}
