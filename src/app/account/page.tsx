import { requirePageUser } from '@/shared/http/page-auth';
import { BackButton } from '@/components/orders/PrintButton';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { MfaSettings } from '@/components/account/MfaSettings';

export const dynamic = 'force-dynamic';

/**
 * Page de compte partagée entre tous les rôles — hors des groupes de layout
 * (dashboard)/(supplier)/(driver), même logique que /orders/[id]/label : un
 * seul gabarit plutôt qu'une copie par espace, `requirePageUser()` sans
 * argument suffisant puisque n'importe quel rôle authentifié y a droit.
 */
export default async function AccountPage() {
  const user = await requirePageUser();

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <BackButton />

      <h1 className="mt-4 text-xl font-semibold text-ink-primary">Mon compte</h1>
      <p className="text-sm text-ink-muted">
        {user.firstName} {user.lastName} · {user.phone}
        {user.email ? ` · ${user.email}` : ''}
      </p>

      <section className="mt-6 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Changer le mot de passe</h2>
        <ChangePasswordForm />
      </section>

      <section className="mt-4 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Double authentification</h2>
        <MfaSettings initialEnabled={user.mfaEnabled} />
      </section>
    </main>
  );
}
