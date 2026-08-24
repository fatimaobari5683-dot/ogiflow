import { PrismaClient } from '@prisma/client';

/**
 * Connexion Prisma + reset de base pour les tests d'INTÉGRATION uniquement.
 * Import explicite (pas de setupFiles global) : les tests unitaires purs
 * (state machine, permissions) n'ont aucune raison de payer le coût d'une
 * transaction de troncature de toutes les tables avant chaque assertion.
 *
 * Cette liste doit être tenue à jour manuellement à chaque nouveau modèle —
 * `idempotency_keys` (aucune FK vers une autre table) est resté absent
 * pendant plusieurs commits sans qu'aucun test ne le remarque, jusqu'à ce
 * qu'un test d'idempotence sur clés répétées across-tests l'expose.
 *
 * Usage dans un fichier de test d'intégration :
 *   import { prisma, resetDatabase } from '../db';
 *   beforeEach(resetDatabase);
 */
export const prisma = new PrismaClient();

const TABLES_IN_DELETE_ORDER = [
  'delivery_events',
  'delivery_attempts',
  'delivery_reviews',
  'order_messages',
  'deliveries',
  'driver_offers',
  'exceptions',
  'documents',
  'order_status_history',
  'order_items',
  'transactions',
  'payments',
  'settlements',
  'orders',
  'promo_codes',
  'products',
  'addresses',
  'customers',
  'driver_zones',
  'drivers',
  'supplier_users',
  'suppliers',
  'zones',
  'notifications',
  'support_messages',
  'support_tickets',
  'audit_logs',
  'sessions',
  'users',
  'idempotency_keys',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$transaction(
    TABLES_IN_DELETE_ORDER.map((table) => prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`))
  );
}
