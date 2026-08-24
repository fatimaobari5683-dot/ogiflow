import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { generateSecret as generateTotpSecret, generateURI as generateTotpUri, verify as verifyTotp } from 'otplib';
import { prisma } from '@/infrastructure/database/client';
import { assignReferralCode, linkReferral } from '@/modules/drivers/referrals.service';
import type { RegisterInput, LoginInput } from './auth.validators';

const MFA_ISSUER = 'LogiFlow';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const BCRYPT_ROUNDS = 12;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  // On échoue tôt plutôt que de démarrer avec un secret faible en production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET manquant ou trop court (min. 32 caractères).');
  }
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

interface TokenPayload {
  sub: string; // userId
  role: string;
  sessionId: string;
}

/**
 * Inscription d'un nouvel utilisateur externe (fournisseur, livreur, client).
 * Les rôles internes (admin, logistique, finance, support) sont créés
 * uniquement par un SUPER_ADMIN via un endpoint distinct et protégé.
 */
export async function register(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, { email: input.email ?? undefined }] },
  });

  if (existing) {
    throw new AuthError('Un compte existe déjà avec ce téléphone ou cet email.', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      passwordHash,
      role: input.role,
      status: 'PENDING_VERIFICATION',
    },
  });

  // Création automatique du profil métier associé — toujours PENDING_APPROVAL :
  // l'inscription ne vaut jamais autorisation (voir onboarding.service.ts pour
  // le passage à ACTIVE, qui ne peut être déclenché que par un opérateur).
  if (input.role === 'SUPPLIER') {
    await prisma.supplier.create({
      data: { userId: user.id, companyName: input.companyName!, status: 'PENDING_APPROVAL' },
    });
  } else if (input.role === 'DRIVER') {
    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        driverCode: `DRV-${nanoid(6).toUpperCase()}`,
        vehicleType: input.vehicleType!,
        status: 'PENDING_APPROVAL',
        address: input.address,
        baseZoneId: input.baseZoneId,
      },
    });
    // La zone déclarée à l'inscription devient aussi sa première zone de
    // service : sans ça, un livreur fraîchement approuvé resterait invisible
    // au scoring de dispatch (zoneMatch) tant qu'un opérateur ne l'assigne
    // pas manuellement — un pas inutile puisque le livreur vient de préciser
    // où il veut travailler.
    if (input.baseZoneId) {
      await prisma.driverZone.create({ data: { driverId: driver.id, zoneId: input.baseZoneId } });
    }
    // Chaque livreur reçoit son propre code de parrainage dès l'inscription
    // (programme décrit dans referrals.service.ts) ; s'il a lui-même été
    // parrainé, le rattachement est silencieux et jamais bloquant.
    await assignReferralCode(driver.id);
    if (input.referralCode) {
      await linkReferral(driver.id, input.referralCode);
    }
  } else if (input.role === 'CUSTOMER') {
    await prisma.customer.create({
      data: { userId: user.id, fullName: `${input.firstName} ${input.lastName}`, phone: input.phone },
    });
  }

  return { userId: user.id, status: user.status };
}

/**
 * Connexion : vérifie mot de passe, MFA si activé, crée une session traçable.
 */
export async function login(input: LoginInput, context: { ip?: string; userAgent?: string }) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: input.identifier }, { email: input.identifier }] },
  });

  if (!user) {
    throw new AuthError('Identifiants invalides.');
  }

  if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
    throw new AuthError('Ce compte est désactivé. Contactez le support.', 403);
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new AuthError('Identifiants invalides.');
  }

  if (user.mfaEnabled) {
    if (!input.mfaCode) {
      throw new AuthError('Code MFA requis.', 401);
    }
    const mfaValid = await verifyMfaCode(user.mfaSecret!, input.mfaCode);
    if (!mfaValid) {
      throw new AuthError('Code MFA invalide.');
    }
  }

  const sessionId = nanoid(21);
  const token = jwt.sign(
    { sub: user.id, role: user.role, sessionId } satisfies TokenPayload,
    JWT_SECRET!,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(token),
      ipAddress: context.ip,
      userAgent: context.userAgent,
      expiresAt: new Date(Date.now() + parseExpiryMs(JWT_EXPIRES_IN)),
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: context.ip },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: context.ip,
    },
  });

  return {
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

/**
 * Étape 1 de l'activation MFA : génère un secret TOTP et le persiste
 * immédiatement (mfaEnabled reste false tant que l'utilisateur n'a pas
 * prouvé qu'il sait le lire, via confirmMfaEnrollment).
 */
export async function generateMfaSecret(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('Utilisateur introuvable.', 404);
  if (user.mfaEnabled) throw new AuthError('La double authentification est déjà activée.', 409);

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });

  const accountLabel = user.email ?? user.phone;
  const otpauthUrl = generateTotpUri({ issuer: MFA_ISSUER, label: accountLabel, secret });
  return { secret, otpauthUrl };
}

/**
 * Étape 2 : l'utilisateur soumet un code généré par son application
 * d'authentification à partir du secret reçu en étape 1 — la preuve qu'il
 * l'a correctement enregistré avant qu'on ne verrouille son compte derrière.
 */
export async function confirmMfaEnrollment(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('Utilisateur introuvable.', 404);
  if (user.mfaEnabled) throw new AuthError('La double authentification est déjà activée.', 409);
  if (!user.mfaSecret) throw new AuthError('Aucune activation MFA en cours. Recommencez.', 409);

  if (!(await verifyMfaCode(user.mfaSecret, code))) {
    throw new AuthError('Code invalide.');
  }

  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await prisma.auditLog.create({
    data: { actorId: userId, action: 'MFA_ENABLED', entityType: 'User', entityId: userId },
  });
}

/**
 * Désactivation MFA — exige le mot de passe (pas juste un code TOTP) pour
 * qu'un appareil déverrouillé volé ne suffise pas à désarmer la protection.
 */
export async function disableMfa(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('Utilisateur introuvable.', 404);

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) throw new AuthError('Mot de passe incorrect.');

  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
  await prisma.auditLog.create({
    data: { actorId: userId, action: 'MFA_DISABLED', entityType: 'User', entityId: userId },
  });
}

/**
 * Changement de mot de passe — révoque les autres sessions actives (sauf
 * celle en cours) : un mot de passe compromis ne sert plus à rien si toutes
 * les autres sessions ouvertes ailleurs sont coupées au même moment.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId?: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('Utilisateur introuvable.', 404);

  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordValid) throw new AuthError('Mot de passe actuel incorrect.');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: { actorId: userId, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId },
  });
}

export async function logout(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Vérifie un JWT et s'assure que la session sous-jacente n'a pas été révoquée
 * (permet la déconnexion forcée immédiate, contrairement à un JWT stateless pur).
 */
export async function verifyToken(token: string) {
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET!) as TokenPayload;
  } catch {
    throw new AuthError('Session invalide ou expirée.');
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AuthError('Session invalide ou expirée.');
  }

  return payload;
}

// --- Fonctions internes ---

function hashToken(token: string): string {
  // On ne stocke jamais le JWT brut, seulement son empreinte.
  return bcrypt.hashSync(token, 4);
}

async function verifyMfaCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verifyTotp({ secret, token: code });
    return result.valid;
  } catch {
    // Code mal formé (pas 6 chiffres, etc.) — traité comme invalide, pas comme une erreur serveur.
    return false;
  }
}

function parseExpiryMs(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = match[1]!;
  const unit = match[2]!;
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(value) * (multipliers[unit] ?? 1000);
}
