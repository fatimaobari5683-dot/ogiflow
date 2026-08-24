import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Régression directe du bug trouvé pendant la validation E2E manuelle
 * (session précédente) : le registre de handlers était une simple variable
 * de module, invisible entre `src/instrumentation.ts` (qui enregistre) et
 * les routes API compilées séparément par Next.js en dev — paiement COD,
 * libération du livreur et notifications ne se déclenchaient JAMAIS, sans
 * aucune erreur. Corrigé via un singleton `global.*`. Ce fichier existe pour
 * que ce bug précis ne puisse plus jamais réapparaître silencieusement.
 */
describe('event-bus — singleton global (protection anti-régression)', () => {
  beforeEach(() => {
    delete (globalThis as { __domainEventHandlers?: unknown }).__domainEventHandlers;
    vi.resetModules();
  });

  it('un handler enregistré est appelé au dispatch', async () => {
    const { onDomainEvent, dispatchDomainEvent } = await import('@/infrastructure/messaging/event-bus');
    const calls: unknown[] = [];
    onDomainEvent('TEST_EVENT', async (payload) => {
      calls.push(payload);
    });
    await dispatchDomainEvent('TEST_EVENT', { hello: 'world' });
    expect(calls).toEqual([{ hello: 'world' }]);
  });

  it('deux imports "frais" du module (simulant deux bundles Next.js séparés) partagent le même registre', async () => {
    vi.resetModules();
    const busA = await import('@/infrastructure/messaging/event-bus');
    const calls: unknown[] = [];
    busA.onDomainEvent('CROSS_MODULE_EVENT', async () => {
      calls.push('handled');
    });

    // Le cœur du scénario du bug : un DEUXIÈME import frais (ex: une route
    // API compilée indépendamment de instrumentation.ts) doit voir le MÊME
    // handler déjà enregistré, jamais un registre vide.
    vi.resetModules();
    const busB = await import('@/infrastructure/messaging/event-bus');
    await busB.dispatchDomainEvent('CROSS_MODULE_EVENT', {});

    expect(calls).toEqual(['handled']);
  });

  it("un handler qui échoue n'empêche pas les autres handlers du même événement de s'exécuter", async () => {
    const { onDomainEvent, dispatchDomainEvent } = await import('@/infrastructure/messaging/event-bus');
    const calls: string[] = [];
    onDomainEvent('MULTI_HANDLER', async () => {
      throw new Error('handler 1 en échec');
    });
    onDomainEvent('MULTI_HANDLER', async () => {
      calls.push('handler2');
    });

    await dispatchDomainEvent('MULTI_HANDLER', {});

    expect(calls).toEqual(['handler2']);
  });

  it('dispatcher un événement sans handler enregistré ne lève jamais', async () => {
    const { dispatchDomainEvent } = await import('@/infrastructure/messaging/event-bus');
    await expect(dispatchDomainEvent('PERSONNE_NECOUTE', {})).resolves.toBeUndefined();
  });

  it('plusieurs handlers sur le même événement sont tous appelés, dans l\'ordre d\'enregistrement', async () => {
    const { onDomainEvent, dispatchDomainEvent } = await import('@/infrastructure/messaging/event-bus');
    const order: number[] = [];
    onDomainEvent('ORDERED_EVENT', async () => {
      order.push(1);
    });
    onDomainEvent('ORDERED_EVENT', async () => {
      order.push(2);
    });
    onDomainEvent('ORDERED_EVENT', async () => {
      order.push(3);
    });

    await dispatchDomainEvent('ORDERED_EVENT', {});

    expect(order).toEqual([1, 2, 3]);
  });
});
