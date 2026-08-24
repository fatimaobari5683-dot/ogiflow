import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/client';
import { getHomePathForRole } from '@/shared/http/role-routing';

export default async function RootPage() {
  const token = cookies().get('logiflow_session')?.value;
  let homePath = '/login';

  if (token) {
    try {
      const payload = await verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true } });
      if (user) {
        homePath = getHomePathForRole(user.role);
      }
    } catch {
      // session invalide/expirée → traité comme non authentifié, reste sur /login
    }
  }

  // `redirect()` lève une erreur spéciale que Next.js doit laisser remonter :
  // ne jamais l'appeler à l'intérieur d'un try/catch générique.
  redirect(homePath);
}
