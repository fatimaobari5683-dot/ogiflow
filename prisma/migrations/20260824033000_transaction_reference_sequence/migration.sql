-- Remplace le calcul "COUNT(*) + 1" (non atomique, sujet aux collisions
-- entre créations concurrentes de Transaction — voir transaction-reference.ts)
-- par une vraie séquence Postgres, dont chaque nextval() est atomique par
-- construction. Démarre après la plus grande référence déjà attribuée pour
-- ne jamais réutiliser un numéro existant.
DO $$
DECLARE
  next_value BIGINT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM 4) AS BIGINT)), 0) + 1
    INTO next_value
    FROM "transactions";

  EXECUTE format('CREATE SEQUENCE "transaction_reference_seq" START WITH %s', next_value);
END $$;
