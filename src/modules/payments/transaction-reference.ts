interface TransactionCounter {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Génère N références séquentielles lisibles (TX-0000128, ...) via la
 * séquence Postgres `transaction_reference_seq` (voir migration
 * add_transaction_reference_sequence) — chaque `nextval()` est atomique par
 * construction, contrairement à l'ancienne approche `count()+1` : deux
 * handlers d'événements qui créent des Transaction en parallèle sur la même
 * commande (ex: encaissement COD et prime de parrainage, tous deux déclenchés
 * par ORDER_DELIVERED) pouvaient lire le même compteur de départ et entrer en
 * collision sur la contrainte d'unicité de `reference` — bug réel trouvé en
 * ajoutant un second créateur de Transaction sur cet événement
 * (referrals.service.ts). Accepte aussi bien le client Prisma racine qu'un
 * client de transaction (`tx`), d'où l'interface structurelle minimale.
 */
export async function nextTransactionReferences(client: TransactionCounter, count: number): Promise<string[]> {
  const rows = await client.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('transaction_reference_seq') AS nextval FROM generate_series(1, ${count})
  `;
  return rows.map((row) => `TX-${String(row.nextval).padStart(7, '0')}`);
}
