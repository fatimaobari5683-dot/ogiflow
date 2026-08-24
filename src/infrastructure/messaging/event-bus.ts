/**
 * Bus d'événements domaine minimal.
 *
 * En V1, chaque événement est traité de façon synchrone via un handler enregistré.
 * En V1.5/V2, ce module sera remplacé par une file BullMQ/Redis pour permettre :
 * - le traitement asynchrone et résilient (retry automatique en cas d'échec SMS, etc.)
 * - le découplage complet entre modules (Orders n'importe jamais Notifications directement)
 *
 * L'interface publique (dispatchDomainEvent) ne changera pas lors de cette migration —
 * seule l'implémentation interne évoluera.
 */

type EventHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Next.js compile chaque route API comme un module graph potentiellement
 * distinct (surtout en dev, avec la compilation à la demande) : une simple
 * variable de module ne garantit PAS une instance unique partagée entre
 * `src/instrumentation.ts` (qui enregistre les handlers) et les routes qui
 * appellent `dispatchDomainEvent`. On force donc un singleton via `global`,
 * exactement comme `src/infrastructure/database/client.ts` le fait pour Prisma.
 */
declare global {
  // eslint-disable-next-line no-var
  var __domainEventHandlers: Map<string, EventHandler[]> | undefined;
}

const handlers = global.__domainEventHandlers ?? new Map<string, EventHandler[]>();
global.__domainEventHandlers = handlers;

export function onDomainEvent(eventName: string, handler: EventHandler) {
  const existing = handlers.get(eventName) ?? [];
  handlers.set(eventName, [...existing, handler]);
}

export async function dispatchDomainEvent(eventName: string, payload: Record<string, unknown>) {
  const registered = handlers.get(eventName) ?? [];

  const results = await Promise.allSettled(registered.map((handler) => handler(payload)));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      // Un handler en échec ne doit jamais bloquer les autres, ni faire
      // échouer la transition de commande déjà validée en base.
      console.error(`[EVENT_HANDLER_FAILED] event=${eventName} handler#${index}`, result.reason);
    }
  });
}
