import { listPromoCodes } from '@/modules/promotions/promotions.service';
import { Card } from '@/components/ui/Card';
import { PromoCodeForm } from '@/components/promotions/PromoCodeForm';
import { PromoCodeToggle } from '@/components/promotions/PromoCodeToggle';

export const dynamic = 'force-dynamic';

export default async function PromotionsPage() {
  const codes = await listPromoCodes();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Codes promo</h1>
        <p className="text-sm text-ink-secondary">{codes.length} code{codes.length > 1 ? 's' : ''}</p>
      </div>

      <PromoCodeForm />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Code</th>
              <th className="pb-2 font-medium">Réduction</th>
              <th className="pb-2 font-medium">Conditions</th>
              <th className="pb-2 font-medium">Utilisation</th>
              <th className="pb-2 font-medium">Expire</th>
              <th className="pb-2 pr-0 text-right font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.id} className="border-b border-hairline last:border-0">
                <td className="py-2 font-mono font-medium text-ink-primary">{code.code}</td>
                <td className="py-2 text-ink-secondary">
                  {code.discountType === 'PERCENTAGE'
                    ? `${Number(code.discountValue)}%${code.maxDiscount ? ` (max ${Number(code.maxDiscount)} MAD)` : ''}`
                    : `${Number(code.discountValue)} MAD`}
                </td>
                <td className="py-2 text-ink-secondary">
                  {code.minOrderAmount ? `Dès ${Number(code.minOrderAmount)} MAD` : '—'}
                </td>
                <td className="py-2 text-ink-secondary">
                  {code.usageCount}
                  {code.usageLimit ? ` / ${code.usageLimit}` : ''}
                </td>
                <td className="py-2 text-ink-secondary">
                  {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td className="py-2 pr-0 text-right">
                  <PromoCodeToggle id={code.id} isActive={code.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {codes.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Aucun code promo créé.</p>}
      </Card>
    </div>
  );
}
