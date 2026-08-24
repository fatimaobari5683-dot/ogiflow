import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infrastructure/database/client';

export class IdempotencyConflictError extends Error {
  statusCode = 409;
  constructor() {
    super('Cette Idempotency-Key a déjà été utilisée avec un contenu de requête différent.');
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyInProgressError extends Error {
  statusCode = 409;
  constructor() {
    super('Une requête avec cette Idempotency-Key est déjà en cours de traitement.');
    this.name = 'IdempotencyInProgressError';
  }
}

const TTL_MS = 24 * 60 * 60 * 1000;

function hashRequestBody(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Rend une opération HTTP rejouable sans effet de bord si le client renvoie
 * la même Idempotency-Key (double-clic, retry réseau après timeout, bouton
 * "précédent" du navigateur). La clé est réservée en base AVANT d'exécuter
 * `handler` (via une contrainte unique (scope, key)) : deux requêtes
 * concurrentes portant la même clé ne peuvent donc jamais exécuter la
 * logique métier deux fois — la seconde échoue avec IdempotencyInProgressError
 * pendant que la première est en cours, ou reçoit la réponse mise en cache
 * une fois la première terminée. Sans clé fournie (en-tête absent), le
 * comportement est inchangé — l'idempotence est strictement opt-in.
 */
export async function withIdempotency<T>(
  params: { scope: string; key: string | null | undefined; requestBody: unknown },
  handler: () => Promise<{ statusCode: number; body: T }>
): Promise<{ statusCode: number; body: T; replayed: boolean }> {
  const { scope, key, requestBody } = params;

  if (!key) {
    const result = await handler();
    return { ...result, replayed: false };
  }

  const requestHash = hashRequestBody(requestBody);

  try {
    await prisma.idempotencyKey.create({
      data: { scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) },
    });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;

    const existing = await prisma.idempotencyKey.findUniqueOrThrow({
      where: { scope_key: { scope, key } },
    });

    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError();
    if (existing.statusCode === null) throw new IdempotencyInProgressError();

    return { statusCode: existing.statusCode, body: existing.responseBody as T, replayed: true };
  }

  try {
    const result = await handler();
    await prisma.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: { statusCode: result.statusCode, responseBody: result.body as Prisma.InputJsonValue },
    });
    return { ...result, replayed: false };
  } catch (err) {
    // Libère la clé pour qu'un retry légitime (après une vraie erreur, pas
    // une simple concurrence) puisse retenter proprement plutôt que de
    // rester bloqué en IdempotencyInProgressError jusqu'à expiration.
    await prisma.idempotencyKey.delete({ where: { scope_key: { scope, key } } }).catch(() => {});
    throw err;
  }
}
