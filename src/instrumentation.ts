/**
 * Point d'entrée exécuté une seule fois au démarrage du serveur Next.js.
 * Sert à enregistrer les handlers d'événements domaine (architecture
 * événementielle découplée — voir src/infrastructure/messaging/event-bus.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerDispatchEventHandlers } = await import('@/modules/dispatch/dispatch.events');
    const { registerPaymentEventHandlers } = await import('@/modules/payments/payments.events');
    const { registerNotificationEventHandlers } = await import('@/modules/notifications/notifications.events');
    registerDispatchEventHandlers();
    registerPaymentEventHandlers();
    registerNotificationEventHandlers();
    console.info('[BOOTSTRAP] Handlers d\'événements domaine enregistrés (dispatch, payments, notifications).');
  }
}
