import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/infrastructure/database/client';
import { verifyToken } from '@/modules/auth/auth.service';

export interface PageUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string | null;
  phone: string;
  mfaEnabled: boolean;
}

/**
 * Équivalent de `getAuthContext` (auth-context.ts) pour les Server Components,
 * qui lisent le cookie via `next/headers` plutôt qu'un `NextRequest`. Redirige
 * vers /login si absent de session valide. Si le rôle n'est pas dans
 * `allowedRoles`, redirige vers `/` — jamais vers une route protégée
 * spécifique (boucle infinie garantie si cette route se protège elle-même) —
 * `/` route ensuite chaque rôle vers son propre espace (voir src/app/page.tsx).
 */
export async function requirePageUser(allowedRoles?: string[]): Promise<PageUser> {
  const token = cookies().get('logiflow_session')?.value;
  if (!token) {
    redirect('/login');
  }

  let userId: string;
  try {
    const payload = await verifyToken(token);
    userId = payload.sub;
  } catch {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, mfaEnabled: true },
  });

  if (!user) {
    redirect('/login');
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect('/');
  }

  return user;
}
