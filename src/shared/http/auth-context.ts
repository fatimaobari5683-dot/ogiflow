import { NextRequest } from 'next/server';
import { prisma } from '@/infrastructure/database/client';
import { verifyToken, AuthError } from '@/modules/auth/auth.service';
import { Permission, hasPermission, assertPermission, ForbiddenError } from '@/shared/constants/permissions';

export interface AuthContext {
  userId: string;
  role: string;
  sessionId: string;
}

const SESSION_COOKIE = 'logiflow_session';

export async function getAuthContext(req: NextRequest): Promise<AuthContext> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new AuthError('Authentification requise.', 401);
  }
  const payload = await verifyToken(token);
  return { userId: payload.sub, role: payload.role, sessionId: payload.sessionId };
}

export async function requirePermission(req: NextRequest, permission: Permission): Promise<AuthContext> {
  const context = await getAuthContext(req);
  assertPermission(context.role, permission);
  return context;
}

/**
 * Autorise l'accès si le rôle dispose d'AU MOINS UNE des permissions listées
 * (ex: lecture ouverte à la fois aux managers finance et logistique).
 */
export async function requireAnyPermission(req: NextRequest, permissions: Permission[]): Promise<AuthContext> {
  const context = await getAuthContext(req);
  if (!permissions.some((permission) => hasPermission(context.role, permission))) {
    throw new ForbiddenError(`Accès refusé : nécessite l'une des permissions [${permissions.join(', ')}].`);
  }
  return context;
}

/**
 * Autorise soit un manager disposant de `managePermission` (ex: DRIVERS_MANAGE),
 * soit le livreur propriétaire de la ressource consultée/modifiée (self-service).
 */
export async function requireDriverAccess(
  req: NextRequest,
  driverId: string,
  managePermission: Permission
): Promise<AuthContext> {
  const context = await getAuthContext(req);

  if (hasPermission(context.role, managePermission)) {
    return context;
  }

  if (context.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
    if (driver?.userId === context.userId) {
      return context;
    }
  }

  throw new ForbiddenError('Accès refusé à ce livreur.');
}

/**
 * Même principe que requireDriverAccess, pour un ticket de support : un
 * agent disposant de SUPPORT_MANAGE, ou l'auteur du ticket consultant/
 * répondant à sa propre demande.
 */
export async function requireTicketAccess(req: NextRequest, ticketId: string): Promise<AuthContext> {
  const context = await getAuthContext(req);

  if (hasPermission(context.role, Permission.SUPPORT_MANAGE)) {
    return context;
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { createdById: true } });
  if (ticket?.createdById === context.userId) {
    return context;
  }

  throw new ForbiddenError('Accès refusé à ce ticket.');
}

/**
 * Même principe que requireDriverAccess, pour les ressources scoping "fournisseur"
 * (analytics, commandes, revenus) : manager avec la permission, ou le fournisseur
 * propriétaire consultant ses propres données.
 */
export async function requireSupplierAccess(
  req: NextRequest,
  supplierId: string,
  managePermission: Permission
): Promise<AuthContext> {
  const context = await getAuthContext(req);

  if (hasPermission(context.role, managePermission)) {
    return context;
  }

  if (context.role === 'SUPPLIER') {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { userId: true } });
    if (supplier?.userId === context.userId) {
      return context;
    }
  }

  throw new ForbiddenError('Accès refusé à ce fournisseur.');
}
