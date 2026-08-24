let registered = false;

/**
 * En production, `src/instrumentation.ts` enregistre les handlers d'événements
 * domaine une seule fois au démarrage du serveur — jamais appelé automatiquement
 * par Vitest. Les tests qui dépendent d'effets déclenchés par événement
 * (paiement COD, libération du livreur, notifications) doivent l'appeler
 * explicitement dans un `beforeAll`. Idempotent : un second appel (ex: entre
 * fichiers de test partageant le même globalThis) ne duplique pas les handlers.
 */
export async function registerAllEventHandlers(): Promise<void> {
  if (registered) return;
  registered = true;

  const { registerDispatchEventHandlers } = await import('@/modules/dispatch/dispatch.events');
  const { registerPaymentEventHandlers } = await import('@/modules/payments/payments.events');
  const { registerNotificationEventHandlers } = await import('@/modules/notifications/notifications.events');
  const { registerDriverReferralEventHandlers } = await import('@/modules/drivers/referrals.events');

  registerDispatchEventHandlers();
  registerPaymentEventHandlers();
  registerNotificationEventHandlers();
  registerDriverReferralEventHandlers();
}
