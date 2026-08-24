import { onDomainEvent } from '@/infrastructure/messaging/event-bus';
import { processCodCollection, compensateDriverForFailedAttempt } from './payments.service';

/**
 * Déclenche automatiquement le traitement de l'encaissement COD dès qu'une
 * commande passe à DELIVERED (correspond à l'événement domaine
 * CREATE_FINANCIAL_TRANSACTION / CALCULATE_COMMISSION déjà émis par la state
 * machine des commandes), et l'indemnisation du livreur quand une commande
 * est retournée après échec (COMPENSATE_DRIVER_FAILED_ATTEMPT, émis sur
 * RETURNED — voir order-state-machine.ts). Enregistré une seule fois au
 * démarrage — voir src/instrumentation.ts.
 */
export function registerPaymentEventHandlers() {
  onDomainEvent('ORDER_DELIVERED', async (payload) => {
    await processCodCollection(payload.orderId as string);
  });

  onDomainEvent('COMPENSATE_DRIVER_FAILED_ATTEMPT', async (payload) => {
    await compensateDriverForFailedAttempt(payload.orderId as string);
  });
}
