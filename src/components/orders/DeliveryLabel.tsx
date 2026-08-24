import QRCode from 'qrcode';

interface DeliveryLabelOrder {
  orderNumber: string;
  createdAt: Date;
  paymentMethod: string;
  totalAmount: unknown;
  instructions: string | null;
  supplier: { companyName: string; contactPhone: string | null } | null;
  customer: { fullName: string; phone: string };
  address: { fullAddress: string; city: string };
  items: { quantity: number }[];
}

/**
 * Bordereau de livraison — inspiré de l'étiquette d'expédition DHL/Chronopost/
 * Amazon Logistics : ce que le fournisseur imprime et colle sur le colis,
 * que le livreur peut aussi consulter. Le QR code encode `LOGIFLOW:<numéro>`
 * plutôt qu'une URL complète — aucune URL publique de base n'est configurée
 * dans ce projet ; un lecteur interne retrouverait la commande par ce
 * numéro. À adapter si un domaine public est un jour disponible.
 */
export async function DeliveryLabel({ order }: { order: DeliveryLabelOrder }) {
  const qrDataUrl = await QRCode.toDataURL(`LOGIFLOW:${order.orderNumber}`, { margin: 1, width: 160 });
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isCod = order.paymentMethod === 'CASH_ON_DELIVERY';

  return (
    <div className="mx-auto w-full max-w-md border-2 border-ink-primary bg-white p-5 text-ink-primary print:border-black print:text-black">
      <div className="flex items-start justify-between border-b-2 border-ink-primary pb-3 print:border-black">
        <div>
          <div className="text-lg font-bold">LogiFlow</div>
          <div className="text-xs uppercase tracking-wide text-ink-muted print:text-black">Bordereau de livraison</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL générée côté serveur, pas une image distante */}
        <img src={qrDataUrl} alt={`Code QR ${order.orderNumber}`} width={80} height={80} />
      </div>

      <div className="mt-3 text-center">
        <div className="text-2xl font-bold tracking-wide">{order.orderNumber}</div>
        <div className="text-xs text-ink-muted print:text-black">
          {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-hairline pt-3 text-sm print:border-black">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Expéditeur</div>
          <div className="mt-1 font-medium">{order.supplier?.companyName ?? '—'}</div>
          {order.supplier?.contactPhone && <div>{order.supplier.contactPhone}</div>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Destinataire</div>
          <div className="mt-1 font-medium">{order.customer.fullName}</div>
          <div>{order.customer.phone}</div>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-3 text-sm print:border-black">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Adresse de livraison</div>
        <div className="mt-1">{order.address.fullAddress}</div>
        <div>{order.address.city}</div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3 text-sm print:border-black">
        <span className="text-ink-muted print:text-black">
          {itemCount} article{itemCount > 1 ? 's' : ''}
        </span>
        {isCod && (
          <span className="rounded-md border-2 border-ink-primary px-3 py-1.5 text-base font-bold print:border-black">
            À ENCAISSER : {Number(order.totalAmount).toLocaleString('fr-FR')} MAD
          </span>
        )}
      </div>

      {order.instructions && (
        <div className="mt-3 border-t border-hairline pt-3 text-sm print:border-black">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Instructions</div>
          <div className="mt-1">{order.instructions}</div>
        </div>
      )}
    </div>
  );
}
