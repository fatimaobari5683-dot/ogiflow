import { requirePageUser } from '@/shared/http/page-auth';
import { DashboardNav } from '@/components/DashboardNav';
import { LogoutButton } from '@/components/LogoutButton';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrateur',
  LOGISTICS_MANAGER: 'Responsable logistique',
  FINANCE_MANAGER: 'Responsable finance',
  SUPPORT_AGENT: 'Agent support',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(['SUPER_ADMIN', 'LOGISTICS_MANAGER', 'FINANCE_MANAGER', 'SUPPORT_AGENT']);

  return (
    <div className="flex min-h-screen bg-surface-page">
      <aside className="w-60 shrink-0 border-r border-hairline bg-surface px-4 py-6">
        <div className="mb-8 px-2">
          <span className="text-lg font-semibold text-brand-700">LogiFlow</span>
        </div>
        <DashboardNav />
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
          <div />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-ink-primary">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</div>
            </div>
            <LogoutButton />
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
