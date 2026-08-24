interface TransactionCounter {
  transaction: { count: () => Promise<number> };
}

/**
 * Génère N références séquentielles lisibles (TX-0000128, ...) à partir d'une
 * seule lecture du compteur — évite les collisions entre créations groupées
 * dans une même transaction Prisma (ex: encaissement COD à 3 mouvements,
 * settlement multi-commandes). Accepte aussi bien le client Prisma racine
 * qu'un client de transaction (`tx`), d'où l'interface structurelle minimale.
 */
export async function nextTransactionReferences(client: TransactionCounter, count: number): Promise<string[]> {
  const base = await client.transaction.count();
  return Array.from({ length: count }, (_, index) => `TX-${String(base + 1 + index).padStart(7, '0')}`);
}
