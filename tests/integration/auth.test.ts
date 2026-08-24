import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { generate as generateTotp, generateSecret as generateTotpSecret } from 'otplib';
import { prisma, resetDatabase } from '../db';
import { createUser } from '../factories';
import {
  login,
  generateMfaSecret,
  confirmMfaEnrollment,
  disableMfa,
  changePassword,
  AuthError,
} from '@/modules/auth/auth.service';

const KNOWN_PASSWORD = 'Passw0rd!2026';

beforeEach(resetDatabase);

describe('changePassword', () => {
  it('rejette un mot de passe actuel incorrect, sans toucher au hash existant', async () => {
    const user = await createUser('CUSTOMER');
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;

    await expect(changePassword(user.id, 'MauvaisMotDePasse!1', 'NouveauMotDePasse!2')).rejects.toThrow(AuthError);

    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    expect(after).toBe(before);
  });

  it('change le hash et révoque les autres sessions actives, en préservant la session courante', async () => {
    const user = await createUser('CUSTOMER');
    const { token: tokenA } = await login({ identifier: user.phone, password: KNOWN_PASSWORD }, {});
    const { token: tokenB } = await login({ identifier: user.phone, password: KNOWN_PASSWORD }, {});
    void tokenB;

    const sessionA = await prisma.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });

    await changePassword(user.id, KNOWN_PASSWORD, 'NouveauMotDePasse!2', sessionA.id);

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    const keptSession = sessions.find((s) => s.id === sessionA.id);
    const otherSessions = sessions.filter((s) => s.id !== sessionA.id);

    expect(keptSession?.revokedAt).toBeNull();
    expect(otherSessions.every((s) => s.revokedAt !== null)).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare('NouveauMotDePasse!2', updated.passwordHash)).toBe(true);
    void tokenA;
  });
});

describe('MFA — activation, connexion, désactivation', () => {
  it("le flux complet : setup → confirmation avec un vrai code TOTP → connexion exige le code → désactivation", async () => {
    const user = await createUser('CUSTOMER');

    const { secret } = await generateMfaSecret(user.id);
    let pending = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(pending.mfaEnabled).toBe(false);
    expect(pending.mfaSecret).toBe(secret);

    const validCode = await generateTotp({ secret });
    await confirmMfaEnrollment(user.id, validCode);

    const enrolled = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(enrolled.mfaEnabled).toBe(true);

    await expect(login({ identifier: user.phone, password: KNOWN_PASSWORD }, {})).rejects.toThrow('Code MFA requis.');

    const wrongLoginCode = await generateTotp({ secret: generateTotpSecret() });
    await expect(
      login({ identifier: user.phone, password: KNOWN_PASSWORD, mfaCode: wrongLoginCode }, {})
    ).rejects.toThrow('Code MFA invalide.');

    const loginCode = await generateTotp({ secret });
    const result = await login({ identifier: user.phone, password: KNOWN_PASSWORD, mfaCode: loginCode }, {});
    expect(result.user.id).toBe(user.id);

    await expect(disableMfa(user.id, 'MauvaisMotDePasse!1')).rejects.toThrow(AuthError);
    await disableMfa(user.id, KNOWN_PASSWORD);

    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(disabled.mfaEnabled).toBe(false);
    expect(disabled.mfaSecret).toBeNull();

    // Une fois désactivé, la connexion ne demande plus de code.
    const postDisable = await login({ identifier: user.phone, password: KNOWN_PASSWORD }, {});
    expect(postDisable.user.id).toBe(user.id);
  });

  it('confirmMfaEnrollment rejette un code invalide et laisse mfaEnabled à false', async () => {
    const user = await createUser('CUSTOMER');
    await generateMfaSecret(user.id);

    await expect(confirmMfaEnrollment(user.id, '000000')).rejects.toThrow(AuthError);

    const stillPending = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stillPending.mfaEnabled).toBe(false);
  });

  it('generateMfaSecret refuse de recommencer une activation déjà active', async () => {
    const user = await createUser('CUSTOMER');
    const { secret } = await generateMfaSecret(user.id);
    const code = await generateTotp({ secret });
    await confirmMfaEnrollment(user.id, code);

    await expect(generateMfaSecret(user.id)).rejects.toThrow(AuthError);
  });
});
