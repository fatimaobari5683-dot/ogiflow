import { describe, it, expect } from 'vitest';
import {
  ORDER_TRANSITIONS,
  canTransition,
  assertValidTransition,
  InvalidTransitionError,
  TERMINAL_STATUSES,
  getDomainEventsForTransition,
} from '@/modules/orders/order-state-machine';
import type { OrderStatus } from '@prisma/client';

const ALL_STATUSES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];

describe('order-state-machine — matrice exhaustive', () => {
  // Génère TOUTES les paires (from, to) possibles — 14×14 = 196 assertions.
  // C'est délibérément exhaustif : une régression sur une seule transition
  // (ex: ré-ouvrir un état terminal) ne doit jamais passer inaperçue.
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const shouldAllow = ORDER_TRANSITIONS[from].includes(to);

      it(`${shouldAllow ? 'autorise' : 'refuse'} ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(shouldAllow);
        if (shouldAllow) {
          expect(() => assertValidTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertValidTransition(from, to)).toThrow(InvalidTransitionError);
        }
      });
    }
  }

  it('les états terminaux ne transitionnent vers rien', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(ORDER_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('tout état terminal est bien inatteignable comme "from" avec une transition sortante', () => {
    for (const status of TERMINAL_STATUSES) {
      const outgoing = ALL_STATUSES.filter((to) => canTransition(status, to));
      expect(outgoing).toHaveLength(0);
    }
  });

  it('chaque statut est atteignable depuis au moins un autre (sauf PENDING, point d\'entrée)', () => {
    for (const target of ALL_STATUSES) {
      if (target === 'PENDING') continue;
      const reachable = ALL_STATUSES.some((from) => canTransition(from, target));
      expect(reachable, `"${target}" n'est atteignable depuis aucun statut — état mort`).toBe(true);
    }
  });
});

describe('order-state-machine — événements domaine', () => {
  it('DELIVERED émet exactement les événements attendus par les modules payments/dispatch/notifications', () => {
    // Ce test protège contre une régression du type "bug event-bus" (session
    // précédente) où un typo dans un nom d'événement casse silencieusement
    // tout un pan métier (paiement, libération livreur, notification) sans
    // qu'aucune erreur ne remonte.
    const events = getDomainEventsForTransition('DELIVERED');
    expect(events).toContain('ORDER_DELIVERED'); // consommé par payments.events.ts ET dispatch.events.ts
    expect(events).toContain('NOTIFY_CUSTOMER'); // consommé par notifications.events.ts
  });

  it('CUSTOMER_ABSENT/WRONG_ADDRESS/CUSTOMER_REFUSED émettent FAILED_DELIVERY', () => {
    for (const status of ['CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED'] as const) {
      expect(getDomainEventsForTransition(status)).toContain('FAILED_DELIVERY');
    }
  });

  it('RETURNED et CANCELLED émettent NOTIFY_SUPPLIER (consommé par dispatch.events.ts pour libérer le livreur)', () => {
    expect(getDomainEventsForTransition('RETURNED')).toContain('ORDER_RETURNED');
    expect(getDomainEventsForTransition('CANCELLED')).toContain('ORDER_CANCELLED');
  });

  it('un statut sans mapping explicite ne lève pas — retourne un tableau vide', () => {
    expect(getDomainEventsForTransition('PENDING')).toEqual([]);
  });
});
