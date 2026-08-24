import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma — évite l'épuisement des connexions PostgreSQL
 * lors du hot-reload en développement (Next.js recharge les modules).
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
