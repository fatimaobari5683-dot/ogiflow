import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { getHomePathForRole } from '@/shared/http/role-routing';
import { prisma } from '@/infrastructure/database/client';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { title: string; body: string; tone: 'pending' | 'critical' }> = {
  PENDING_APPROVAL: {
    title: 'Votre inscription est en cours de validation',
    body: "Un opérateur LogiFlow examine votre dossier. Vous recevrez un email dès que votre compte sera activé — cela prend généralement moins de 24h ouvrées.",
    tone: 'pending',
  },
  REJECTED: {
    title: "Votre demande n'a pas été retenue",
    body: '',
    tone: 'critical',
  },
  SUSPENDED: {
    title: 'Votre compte est suspendu',
    body: 'Contactez le support LogiFlow pour en connaître le motif et les conditions de réactivation.',
    tone: 'critical',
  },
};

export default async function OnboardingPendingPage() {
  const user = await requirePageUser(['SUPPLIER', 'DRIVER']);

  const profile =
    user.role === 'SUPPLIER'
      ? await prisma.supplier.findUnique({ where: { userId: user.id }, select: { status: true, rejectionReason: true } })
      : await prisma.driver.findUnique({ where: { userId: user.id }, select: { status: true, rejectionReason: true } });

  // Le statut a évolué depuis la dernière visite (approuvé entre-temps,
  // ou consultation directe de l'URL par un compte déjà actif) — on ne
  // laisse jamais un compte activé bloqué sur cette page.
  const isResolved = user.role === 'SUPPLIER' ? profile?.status === 'ACTIVE' : profile?.status === 'AVAILABLE' || profile?.status === 'OFFLINE' || profile?.status === 'BUSY';
  if (!profile || isResolved) {
    redirect(getHomePathForRole(user.role));
  }

  const message = MESSAGES[profile.status] ?? MESSAGES.PENDING_APPROVAL!;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-md rounded-lg border border-hairline bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-brand-700">LogiFlow</h1>
        <div
          className={`mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full text-xl ${
            message.tone === 'critical' ? 'bg-status-critical/10 text-status-critical' : 'bg-status-warning/15 text-[#8a5a00]'
          }`}
        >
          {message.tone === 'critical' ? '✕' : '⏳'}
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink-primary">{message.title}</h2>
        <p className="mt-2 text-sm text-ink-secondary">{message.body}</p>

        {profile.status === 'REJECTED' && profile.rejectionReason && (
          <div className="mt-4 rounded-md bg-status-critical/10 px-3 py-2 text-left text-sm text-status-critical">
            <span className="font-medium">Motif : </span>
            {profile.rejectionReason}
          </div>
        )}

        <Link href="/login" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
          Retour à la connexion
        </Link>
      </div>
    </main>
  );
}
