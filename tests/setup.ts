/**
 * Chargé globalement pour TOUS les fichiers de test (voir vitest.config.mts).
 * Garde-fou léger uniquement — aucune connexion DB ici, pour que les tests
 * unitaires purs (state machine, permissions) restent instantanés. Les
 * tests d'intégration importent explicitement `tests/db.ts` pour la
 * connexion Prisma et le reset de base.
 */
const databaseUrl = process.env.DATABASE_URL ?? '';

if (!databaseUrl.includes('test')) {
  throw new Error(
    `Refus de lancer la suite de tests : DATABASE_URL ne pointe pas vers une base de test ` +
      `(reçu : ${databaseUrl.replace(/:[^:@]+@/, ':***@')}). ` +
      `Lancez via "npm test" (charge .env.test) — jamais directement contre .env.`
  );
}
