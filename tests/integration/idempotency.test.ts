import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import {
  withIdempotency,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from '@/shared/http/idempotency';

beforeEach(resetDatabase);

describe('withIdempotency — sans clé fournie', () => {
  it('exécute le handler normalement et ne persiste rien', async () => {
    let calls = 0;
    const result = await withIdempotency(
      { scope: 'test:scope', key: null, requestBody: { a: 1 } },
      async () => {
        calls += 1;
        return { statusCode: 201, body: { ok: true } };
      }
    );

    expect(calls).toBe(1);
    expect(result).toEqual({ statusCode: 201, body: { ok: true }, replayed: false });
    expect(await prisma.idempotencyKey.count()).toBe(0);
  });
});

describe('withIdempotency — avec clé fournie', () => {
  it("exécute le handler une seule fois et rejoue la réponse mise en cache sur une clé identique", async () => {
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return { statusCode: 201, body: { orderId: `order-${calls}` } };
    };

    const first = await withIdempotency({ scope: 'orders:create', key: 'KEY-1', requestBody: { a: 1 } }, handler);
    const second = await withIdempotency({ scope: 'orders:create', key: 'KEY-1', requestBody: { a: 1 } }, handler);

    expect(calls).toBe(1);
    expect(first).toEqual({ statusCode: 201, body: { orderId: 'order-1' }, replayed: false });
    expect(second).toEqual({ statusCode: 201, body: { orderId: 'order-1' }, replayed: true });
  });

  it('rejette avec IdempotencyConflictError si la même clé est réutilisée avec un corps de requête différent', async () => {
    await withIdempotency(
      { scope: 'orders:create', key: 'KEY-2', requestBody: { amount: 100 } },
      async () => ({ statusCode: 201, body: { ok: true } })
    );

    await expect(
      withIdempotency(
        { scope: 'orders:create', key: 'KEY-2', requestBody: { amount: 999 } },
        async () => ({ statusCode: 201, body: { ok: true } })
      )
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('isole les clés par scope — même clé, scopes différents, deux exécutions réelles', async () => {
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return { statusCode: 201, body: { calls } };
    };

    await withIdempotency({ scope: 'orders:create', key: 'SHARED', requestBody: { a: 1 } }, handler);
    await withIdempotency({ scope: 'settlements:create', key: 'SHARED', requestBody: { a: 1 } }, handler);

    expect(calls).toBe(2);
  });

  it('rejette avec IdempotencyInProgressError si une requête concurrente détient déjà la clé', async () => {
    await prisma.idempotencyKey.create({
      data: {
        scope: 'orders:create',
        key: 'KEY-3',
        requestHash: '0'.repeat(64), // peu importe la vraie empreinte pour ce test
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    // Même empreinte que le corps ci-dessous, pour isoler le test sur le cas "en cours" plutôt que "conflit".
    const crypto = await import('crypto');
    const requestBody = { a: 1 };
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
    await prisma.idempotencyKey.update({ where: { scope_key: { scope: 'orders:create', key: 'KEY-3' } }, data: { requestHash } });

    await expect(
      withIdempotency({ scope: 'orders:create', key: 'KEY-3', requestBody }, async () => ({ statusCode: 201, body: {} }))
    ).rejects.toThrow(IdempotencyInProgressError);
  });

  it('libère la clé si le handler échoue, pour permettre un retry légitime', async () => {
    let calls = 0;
    const failingHandler = async () => {
      calls += 1;
      throw new Error('panne temporaire');
    };

    await expect(
      withIdempotency({ scope: 'orders:create', key: 'KEY-4', requestBody: { a: 1 } }, failingHandler)
    ).rejects.toThrow('panne temporaire');

    expect(await prisma.idempotencyKey.count()).toBe(0);

    const result = await withIdempotency(
      { scope: 'orders:create', key: 'KEY-4', requestBody: { a: 1 } },
      async () => ({ statusCode: 201, body: { recovered: true } })
    );
    expect(result).toEqual({ statusCode: 201, body: { recovered: true }, replayed: false });
  });
});
