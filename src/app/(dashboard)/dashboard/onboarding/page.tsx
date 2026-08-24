import { listPendingSuppliers, listPendingDrivers } from '@/modules/onboarding/onboarding.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { OnboardingActions } from '@/components/onboarding/OnboardingActions';

export const dynamic = 'force-dynamic';

const VEHICLE_LABELS: Record<string, string> = {
  MOTORCYCLE: 'Moto',
  CAR: 'Voiture',
  VAN: 'Utilitaire',
  BICYCLE: 'Vélo',
  TRUCK: 'Camion',
};

export default async function OnboardingPage() {
  const [suppliers, drivers] = await Promise.all([listPendingSuppliers(), listPendingDrivers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Inscriptions en attente</h1>
        <p className="text-sm text-ink-secondary">
          Un compte inscrit ne peut ni créer de commandes ni recevoir de missions avant approbation.
        </p>
      </div>

      <Card>
        <CardHeader title={`Fournisseurs (${suppliers.length})`} />
        {suppliers.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Aucune inscription fournisseur en attente.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {suppliers.map((supplier) => (
              <li key={supplier.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <div className="font-medium text-ink-primary">{supplier.companyName}</div>
                  <div className="text-sm text-ink-secondary">
                    {supplier.user.firstName} {supplier.user.lastName} · {supplier.user.phone}
                    {supplier.user.email ? ` · ${supplier.user.email}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    Inscrit le {new Date(supplier.user.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <OnboardingActions type="supplier" id={supplier.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Livreurs (${drivers.length})`} />
        {drivers.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Aucune inscription livreur en attente.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <div className="font-medium text-ink-primary">
                    {driver.user.firstName} {driver.user.lastName}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink-secondary">
                      {driver.driverCode}
                    </span>
                  </div>
                  <div className="text-sm text-ink-secondary">
                    {VEHICLE_LABELS[driver.vehicleType] ?? driver.vehicleType} · {driver.user.phone}
                    {driver.user.email ? ` · ${driver.user.email}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    Inscrit le {new Date(driver.user.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <OnboardingActions type="driver" id={driver.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
