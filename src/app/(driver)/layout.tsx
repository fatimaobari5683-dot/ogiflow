import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { getDriverByUserId } from '@/modules/drivers/drivers.service';
import { AvailabilityToggle } from '@/components/driver/AvailabilityToggle';
import { DriverLocationPing } from '@/components/driver/DriverLocationPing';
import { LogoutButton } from '@/components/LogoutButton';

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(['DRIVER']);
  const driver = await getDriverByUserId(user.id);

  if (!driver) {
    redirect('/login');
  }

  // Un compte inscrit mais pas encore approuvé (ou refusé/suspendu) ne doit
  // jamais atteindre l'app livreur. Dispatch ne sélectionne déjà que les
  // livreurs AVAILABLE, donc PENDING_APPROVAL ne pouvait jamais recevoir de
  // mission — ce blocage protège l'accès à l'écran lui-même, pas une faille
  // de dispatch (défense en profondeur / clarté pour le livreur inscrit).
  if (driver.status === 'PENDING_APPROVAL' || driver.status === 'REJECTED' || driver.status === 'SUSPENDED') {
    redirect('/onboarding/pending');
  }

  const isOnline = driver.status === 'AVAILABLE' || driver.status === 'BUSY';

  return (
    <div className="min-h-screen bg-surface-page">
      <DriverLocationPing driverId={driver.id} isOnline={isOnline} />
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-ink-primary">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-ink-muted">{driver.driverCode}</div>
          </div>
          <div className="flex items-center gap-3">
            <AvailabilityToggle driverId={driver.id} status={driver.status} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">{children}</main>

      <footer className="mx-auto max-w-md space-y-3 px-4 py-6 text-center">
        <Link href="/earnings" className="block text-sm text-brand-600 hover:underline">
          Mes gains
        </Link>
        <Link href="/leaderboard" className="block text-sm text-brand-600 hover:underline">
          Classement
        </Link>
        <Link href="/documents" className="block text-sm text-brand-600 hover:underline">
          Mes documents
        </Link>
        <Link href="/support" className="block text-sm text-brand-600 hover:underline">
          Aide
        </Link>
        <Link href="/referrals" className="block text-sm text-brand-600 hover:underline">
          Parrainage
        </Link>
        <Link href="/account" className="block text-sm text-brand-600 hover:underline">
          Mon compte
        </Link>
        <LogoutButton />
      </footer>
    </div>
  );
}
