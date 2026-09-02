import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
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
import { resetRateLimiterStateForTests } from '@/infrastructure/rate-limit/rate-limiter';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';

const KNOWN_PASSWORD = 'Passw0rd!2026';

beforeEach(async () => {
  await resetDatabase();
  // Le rate-limiter vit dans un singleton `global.*` (voir rate-limiter.ts)
  // qui survit à la ré-évaluation des modules entre tests — doit être vidé
  // explicitement, même principe que la protection du bus d'événements
  // dans event-bus.test.ts.
  resetRateLimiterStateForTests();
});

function buildLoginRequest(body: unknown, ip = '10.0.0.1') {
  return new NextRequest('http://localhost/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

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

describe('POST /api/v1/auth/login — rate limiting', () => {
  let uniqueCounter = 0;
  function fakeIdentifier(): string {
    uniqueCounter += 1;
    return `+2129${String(uniqueCounter).padStart(8, '0')}`;
  }
  function fakeIp(): string {
    uniqueCounter += 1;
    return `10.0.${Math.floor(uniqueCounter / 255)}.${uniqueCounter % 255}`;
  }

  it('reste sous la limite IP : les requêtes se comportent normalement', async () => {
    const user = await createUser('CUSTOMER');
    const ip = fakeIp();
    for (let i = 0; i < 3; i++) {
      const res = await loginRoute(buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, ip));
      expect(res.status).toBe(200);
    }
  });

  it('le bucket IP bloque après 10 tentatives (identifiants différents à chaque fois)', async () => {
    const ip = fakeIp();
    for (let i = 0; i < 10; i++) {
      const res = await loginRoute(
        buildLoginRequest({ identifier: fakeIdentifier(), password: 'peu importe' }, ip)
      );
      // Identifiants inexistants — 401 attendu, pas 429, tant que le bucket IP n'est pas plein.
      expect(res.status).toBe(401);
    }
    const blocked = await loginRoute(
      buildLoginRequest({ identifier: fakeIdentifier(), password: 'peu importe' }, ip)
    );
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body).toEqual({ success: false, error: 'RATE_LIMITED', retryAfterSeconds: expect.any(Number) });
  });

  it("le bucket identifiant bloque après 5 tentatives, même depuis des IP différentes", async () => {
    const user = await createUser('CUSTOMER');
    for (let i = 0; i < 5; i++) {
      const res = await loginRoute(
        buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp())
      );
      expect(res.status).toBe(200); // sous la limite identifiant (5), IP toujours différente donc jamais son propre bucket plein
    }
    const blocked = await loginRoute(
      buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp())
    );
    expect(blocked.status).toBe(429);
  });

  it('deux buckets IP restent indépendants', async () => {
    const ipA = fakeIp();
    const ipB = fakeIp();
    for (let i = 0; i < 10; i++) {
      await loginRoute(buildLoginRequest({ identifier: fakeIdentifier(), password: 'x' }, ipA));
    }
    const blockedOnA = await loginRoute(buildLoginRequest({ identifier: fakeIdentifier(), password: 'x' }, ipA));
    expect(blockedOnA.status).toBe(429);

    // IP B n'a jamais été sollicitée — doit rester pleinement disponible.
    const stillOkOnB = await loginRoute(buildLoginRequest({ identifier: fakeIdentifier(), password: 'x' }, ipB));
    expect(stillOkOnB.status).toBe(401); // identifiant inexistant, mais PAS rate-limited
  });

  it("le même identifiant accumule sa limite à travers plusieurs IP différentes", async () => {
    const user = await createUser('CUSTOMER');
    for (let i = 0; i < 3; i++) {
      const res = await loginRoute(buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp()));
      expect(res.status).toBe(200);
    }
    for (let i = 0; i < 2; i++) {
      const res = await loginRoute(buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp()));
      expect(res.status).toBe(200);
    }
    // 6e tentative pour ce même identifiant, depuis une 6e IP distincte — bloquée.
    const blocked = await loginRoute(buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp()));
    expect(blocked.status).toBe(429);
  });

  it('un identifiant inexistant produit exactement la même réponse générique de blocage qu\'un compte réel', async () => {
    const user = await createUser('CUSTOMER');
    const nonExistentIdentifier = fakeIdentifier();

    for (let i = 0; i < 5; i++) {
      await loginRoute(buildLoginRequest({ identifier: nonExistentIdentifier, password: 'x' }, fakeIp()));
    }
    const blockedNonExistent = await loginRoute(
      buildLoginRequest({ identifier: nonExistentIdentifier, password: 'x' }, fakeIp())
    );

    for (let i = 0; i < 5; i++) {
      await loginRoute(buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp()));
    }
    const blockedReal = await loginRoute(
      buildLoginRequest({ identifier: user.phone, password: KNOWN_PASSWORD }, fakeIp())
    );

    expect(blockedNonExistent.status).toBe(429);
    expect(blockedReal.status).toBe(429);
    const bodyNonExistent = await blockedNonExistent.json();
    const bodyReal = await blockedReal.json();
    // Même forme exacte de clés, même code d'erreur générique — aucun signal
    // ne distingue "compte existant" de "compte inexistant" au blocage.
    expect(Object.keys(bodyNonExistent).sort()).toEqual(Object.keys(bodyReal).sort());
    expect(bodyNonExistent.error).toBe('RATE_LIMITED');
    expect(bodyReal.error).toBe('RATE_LIMITED');
  });

  it('Retry-After est présent en en-tête HTTP ET dans le corps JSON', async () => {
    const ip = fakeIp();
    for (let i = 0; i < 10; i++) {
      await loginRoute(buildLoginRequest({ identifier: fakeIdentifier(), password: 'x' }, ip));
    }
    const blocked = await loginRoute(buildLoginRequest({ identifier: fakeIdentifier(), password: 'x' }, ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    const body = await blocked.json();
    expect(body.retryAfterSeconds).toBe(Number(blocked.headers.get('Retry-After')));
  });
});
