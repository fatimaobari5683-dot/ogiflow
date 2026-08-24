interface OrderInvoiceOrder {
  orderNumber: string;
  createdAt: Date;
  paymentMethod: string;
  paymentStatus: string;
  subtotalAmount: unknown;
  deliveryFee: unknown;
  discountAmount: unknown;
  totalAmount: unknown;
  supplier: { companyName: string; taxId: string | null; billingAddress: string | null; contactPhone: string | null } | null;
  customer: { fullName: string; phone: string; email: string | null };
  address: { fullAddress: string; city: string };
  items: { id: string; quantity: number; unitPrice: unknown; lineTotal: unknown; product: { name: string } }[];
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH_ON_DELIVERY: 'Paiement à la livraison',
  CARD: 'Carte bancaire',
  BANK_TRANSFER: 'Virement bancaire',
};

/**
 * Facture/reçu de vente — document du fournisseur (vendeur) au client, pas
 * un document interne LogiFlow. Même style que le bordereau de livraison
 * (DeliveryLabel.tsx) pour cohérence visuelle entre les documents
 * imprimables de la plateforme, mais un contenu différent : ici le détail
 * des prix payés par le client, jamais la commission/le versement fournisseur
 * (ça, c'est l'objet de l'état de versement — SettlementStatement.tsx).
 */
export function OrderInvoice({ order }: { order: OrderInvoiceOrder }) {
  const discount = Number(order.discountAmount);

  return (
    <div className="mx-auto w-full max-w-lg border-2 border-ink-primary bg-white p-6 text-ink-primary print:border-black print:text-black">
      <div className="flex items-start justify-between border-b-2 border-ink-primary pb-3 print:border-black">
        <div>
          <div className="text-lg font-bold">{order.supplier?.companyName ?? '—'}</div>
          {order.supplier?.billingAddress && <div className="text-xs text-ink-muted print:text-black">{order.supplier.billingAddress}</div>}
          {order.supplier?.taxId && <div className="text-xs text-ink-muted print:text-black">IF/ICE : {order.supplier.taxId}</div>}
          {order.supplier?.contactPhone && <div className="text-xs text-ink-muted print:text-black">{order.supplier.contactPhone}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-ink-muted print:text-black">Facture</div>
          <div className="text-lg font-bold tracking-wide">{order.orderNumber}</div>
          <div className="text-xs text-ink-muted print:text-black">
            {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-b border-hairline pb-3 text-sm print:border-black">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Facturé à</div>
          <div className="mt-1 font-medium">{order.customer.fullName}</div>
          <div>{order.customer.phone}</div>
          {order.customer.email && <div>{order.customer.email}</div>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Adresse de livraison</div>
          <div className="mt-1">{order.address.fullAddress}</div>
          <div>{order.address.city}</div>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted print:border-black print:text-black">
            <th className="pb-2 font-medium">Article</th>
            <th className="pb-2 text-right font-medium">Qté</th>
            <th className="pb-2 text-right font-medium">Prix unitaire</th>
            <th className="pb-2 pr-0 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="py-1.5">{item.product.name}</td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">{Number(item.unitPrice).toLocaleString('fr-FR')} MAD</td>
              <td className="py-1.5 pr-0 text-right">{Number(item.lineTotal).toLocaleString('fr-FR')} MAD</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-sm print:border-black">
        <div className="flex justify-between">
          <span className="text-ink-muted print:text-black">Sous-total</span>
          <span>{Number(order.subtotalAmount).toLocaleString('fr-FR')} MAD</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted print:text-black">Frais de livraison</span>
          <span>{Number(order.deliveryFee).toLocaleString('fr-FR')} MAD</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between">
            <span className="text-ink-muted print:text-black">Réduction</span>
            <span>−{discount.toLocaleString('fr-FR')} MAD</span>
          </div>
        )}
        <div className="flex justify-between border-t border-hairline pt-1.5 text-base font-bold print:border-black">
          <span>Total</span>
          <span>{Number(order.totalAmount).toLocaleString('fr-FR')} MAD</span>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-3 text-xs text-ink-muted print:border-black print:text-black">
        {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} — {order.paymentStatus === 'CONFIRMED' ? 'payé' : 'en attente de paiement'}
      </div>
    </div>
  );
}
