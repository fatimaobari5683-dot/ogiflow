import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRateLimiter,
  setRateLimiter,
  resetRateLimiterStateForTests,
  checkRateLimit,
  extractClientIp,
  hashForRateLimitKey,
  RateLimitError,
  RATE_LIMIT_SWEEP_INTERVAL_CHECKS,
  __getRateLimitBucketCountForTests,
  type RateLimiter,
} from '@/infrastructure/rate-limit/rate-limiter';

beforeEach(resetRateLimiterStateForTests);

function fakeRequest(headers: Record<string, string>) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null } };
}

describe('InMemoryRateLimiter — fenêtre fixe', () => {
  it('la première requête pour une clé est toujours autorisée', () => {
    const result = getRateLimiter().consume('k1', 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('les requêtes sous le seuil restent autorisées', () => {
    const limiter = getRateLimiter();
    for (let i = 0; i < 4; i++) {
      expect(limiter.consume('k2', 5, 60).allowed).toBe(true);
    }
  });

  it('la requête exactement au seuil reste autorisée', () => {
    const limiter = getRateLimiter();
    let last;
    for (let i = 0; i < 5; i++) {
      last = limiter.consume('k3', 5, 60);
    }
    expect(last!.allowed).toBe(true);
    expect(last!.remaining).toBe(0);
  });

  it('seuil + 1 est bloqué', () => {
    const limiter = getRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.consume('k4', 5, 60);
    }
    const blocked = limiter.consume('k4', 5, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('retryAfterSeconds est positif et cohérent avec la fenêtre restante', () => {
    vi.useFakeTimers();
    try {
      const limiter = getRateLimiter();
      for (let i = 0; i < 3; i++) {
        limiter.consume('k5', 3, 100);
      }
      vi.advanceTimersByTime(40_000); // 40s écoulées sur une fenêtre de 100s
      const blocked = limiter.consume('k5', 3, 100);
      expect(blocked.allowed).toBe(false);
      // ~60s restantes (100 - 40), tolérance de 1s pour l'arrondi.
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(59);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    } finally {
      vi.useRealTimers();
    }
  });

  it('la fenêtre se réinitialise après son expiration', () => {
    vi.useFakeTimers();
    try {
      const limiter = getRateLimiter();
      for (let i = 0; i < 2; i++) {
        limiter.consume('k6', 2, 30);
      }
      expect(limiter.consume('k6', 2, 30).allowed).toBe(false);

      vi.advanceTimersByTime(31_000); // fenêtre expirée

      const afterReset = limiter.consume('k6', 2, 30);
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("deux clés indépendantes n'interfèrent jamais l'une avec l'autre", () => {
    const limiter = getRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.consume('bucket-a', 5, 60);
    }
    expect(limiter.consume('bucket-a', 5, 60).allowed).toBe(false);
    // bucket-b n'a jamais été touché — doit rester pleinement disponible.
    expect(limiter.consume('bucket-b', 5, 60).allowed).toBe(true);
  });

  it("aucune collision entre des clés partageant un préfixe similaire", () => {
    const limiter = getRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.consume('login:ip:1.2.3.4', 5, 60);
    }
    expect(limiter.consume('login:ip:1.2.3.4', 5, 60).allowed).toBe(false);
    // Une clé textuellement proche mais distincte reste indépendante.
    expect(limiter.consume('login:ip:1.2.3.40', 5, 60).allowed).toBe(true);
    expect(limiter.consume('login:identifier:1.2.3.4', 5, 60).allowed).toBe(true);
  });
});

describe('checkRateLimit — vérification composite', () => {
  it("n'échoue pas si tous les buckets sont sous leur limite", () => {
    expect(() =>
      checkRateLimit([
        { key: 'a', limit: 5, windowSeconds: 60 },
        { key: 'b', limit: 5, windowSeconds: 60 },
      ])
    ).not.toThrow();
  });

  it('lève RateLimitError si un seul des buckets dépasse sa limite', () => {
    // Épuise le bucket "b" seul.
    for (let i = 0; i < 5; i++) {
      checkRateLimit([{ key: 'b-only', limit: 5, windowSeconds: 60 }]);
    }
    expect(() =>
      checkRateLimit([
        { key: 'a-only', limit: 5, windowSeconds: 60 },
        { key: 'b-only', limit: 5, windowSeconds: 60 },
      ])
    ).toThrow(RateLimitError);
  });

  it('chaque vérification consomme son bucket même si un autre bucket de la même liste est déjà plein', () => {
    for (let i = 0; i < 2; i++) {
      checkRateLimit([{ key: 'always-full', limit: 2, windowSeconds: 60 }]);
    }
    // "always-full" est déjà à sa limite ; "fresh" ne l'est pas encore.
    expect(() =>
      checkRateLimit([
        { key: 'always-full', limit: 2, windowSeconds: 60 },
        { key: 'fresh', limit: 2, windowSeconds: 60 },
      ])
    ).toThrow(RateLimitError);
    // "fresh" a bien été consommé une fois malgré le rejet global — la
    // règle "toutes les tentatives comptent" s'applique même aux tentatives
    // finalement bloquées par un autre bucket.
    checkRateLimit([{ key: 'fresh', limit: 2, windowSeconds: 60 }]); // 2ᵉ appel, encore permis
    expect(() => checkRateLimit([{ key: 'fresh', limit: 2, windowSeconds: 60 }])).toThrow(RateLimitError);
  });

  it("expose retryAfterSeconds sur l'erreur levée", () => {
    for (let i = 0; i < 1; i++) {
      checkRateLimit([{ key: 'retry-key', limit: 1, windowSeconds: 60 }]);
    }
    try {
      checkRateLimit([{ key: 'retry-key', limit: 1, windowSeconds: 60 }]);
      expect.unreachable('devait lever RateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
      expect((err as RateLimitError).statusCode).toBe(429);
    }
  });
});

describe('extractClientIp — extraction sûre (aucune confiance cryptographique)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('extrait une IPv4 valide depuis X-Forwarded-For', () => {
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('extrait une IPv6 valide depuis X-Forwarded-For et la normalise en minuscules', () => {
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': '2001:DB8::1' }))).toBe('2001:db8::1');
  });

  it('retire les crochets IPv6 le cas échéant', () => {
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': '[2001:db8::1]' }))).toBe('2001:db8::1');
  });

  it('prend le premier segment d\'une chaîne X-Forwarded-For à plusieurs sauts', () => {
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': '198.51.100.5, 10.0.0.1, 10.0.0.2' }))).toBe(
      '198.51.100.5'
    );
  });

  it('retombe sur X-Real-IP si X-Forwarded-For est absent', () => {
    expect(extractClientIp(fakeRequest({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('retombe sur le bucket "unknown" stable quand aucun en-tête n\'est présent', () => {
    expect(extractClientIp(fakeRequest({}))).toBe('unknown');
    expect(extractClientIp(fakeRequest({}))).toBe('unknown'); // stable, pas aléatoire
  });

  it('ignore un en-tête malformé (caractères impossibles) et retombe sur "unknown"', () => {
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': '<script>alert(1)</script>' }))).toBe('unknown');
  });

  it('ignore une valeur absurdement longue plutôt que de créer un bucket dégénéré', () => {
    const huge = '1'.repeat(5000);
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': huge }))).toBe('unknown');
  });

  it('ne plante jamais, même sur une chaîne vide ou uniquement des virgules', () => {
    expect(() => extractClientIp(fakeRequest({ 'x-forwarded-for': '' }))).not.toThrow();
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': '' }))).toBe('unknown');
    expect(() => extractClientIp(fakeRequest({ 'x-forwarded-for': ',,,' }))).not.toThrow();
    expect(extractClientIp(fakeRequest({ 'x-forwarded-for': ',,,' }))).toBe('unknown');
  });

  it('retombe sur X-Real-IP si le premier segment de X-Forwarded-For est malformé', () => {
    expect(
      extractClientIp(fakeRequest({ 'x-forwarded-for': 'not-an-ip', 'x-real-ip': '203.0.113.55' }))
    ).toBe('203.0.113.55');
  });
});

describe('hashForRateLimitKey — clé de bucket bornée pour une valeur arbitraire', () => {
  it('la même valeur normalisée produit toujours le même hash (même bucket)', () => {
    const normalize = (v: string) => v.trim().toLowerCase();
    const a = hashForRateLimitKey(normalize('  Test@Example.com  '));
    const b = hashForRateLimitKey(normalize('test@example.com'));
    expect(a).toBe(b);
  });

  it('deux identifiants distincts produisent des hashs distincts', () => {
    expect(hashForRateLimitKey('user-a@test.local')).not.toBe(hashForRateLimitKey('user-b@test.local'));
  });

  it('un identifiant extrêmement long produit tout de même une clé de longueur bornée', () => {
    const huge = 'x'.repeat(200_000);
    const hash = hashForRateLimitKey(huge);
    expect(hash.length).toBe(64); // SHA-256 hex — toujours 64 caractères, quelle que soit l'entrée
  });

  it("l'identifiant brut n'apparaît jamais dans la clé générée", () => {
    const raw = 'super-secret-identifier-value-12345';
    const hash = hashForRateLimitKey(raw);
    expect(hash).not.toContain(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('InMemoryRateLimiter — éviction mémoire (balayage opportuniste)', () => {
  it('un bucket expiré et jamais revisité finit par être évacué du Map', () => {
    vi.useFakeTimers();
    try {
      const limiter = getRateLimiter();

      // Bucket qui expire vite et n'est plus jamais consulté ensuite.
      limiter.consume('to-expire', 5, 10);
      expect(__getRateLimitBucketCountForTests()).toBe(1);
      vi.advanceTimersByTime(11_000); // expire — mais rien ne le revisite

      // Déclenche assez de vérifications SANS RAPPORT pour atteindre la
      // cadence de balayage opportuniste.
      for (let i = 0; i < RATE_LIMIT_SWEEP_INTERVAL_CHECKS; i++) {
        limiter.consume(`unrelated-${i}`, 100, 60);
      }

      // Si le bucket expiré avait survécu, on aurait N+1 entrées. Le
      // balayage l'a retiré : il n'en reste que N (les clés actives).
      expect(__getRateLimitBucketCountForTests()).toBe(RATE_LIMIT_SWEEP_INTERVAL_CHECKS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('le balayage ne modifie jamais le résultat pour une clé active (comportement transparent)', () => {
    vi.useFakeTimers();
    try {
      const limiter = getRateLimiter();
      for (let i = 0; i < 3; i++) {
        expect(limiter.consume('still-active', 5, 3600).allowed).toBe(true);
      }
      // Balayage déclenché par du bruit — la clé "still-active" n'a pas expiré.
      for (let i = 0; i < RATE_LIMIT_SWEEP_INTERVAL_CHECKS; i++) {
        limiter.consume(`noise-${i}`, 100, 3600);
      }
      // Toujours à 3/5 consommés, pas réinitialisée par le balayage.
      const fourth = limiter.consume('still-active', 5, 3600);
      expect(fourth.allowed).toBe(true);
      expect(fourth.remaining).toBe(1); // 5 - 4
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resetRateLimiterStateForTests — preuve falsifiable', () => {
  it('une clé épuisée redevient immédiatement utilisable après reset (même clé exacte)', () => {
    const limiter = getRateLimiter();
    for (let i = 0; i < 3; i++) {
      limiter.consume('exhaust-me', 3, 3600);
    }
    expect(limiter.consume('exhaust-me', 3, 3600).allowed).toBe(false); // vérifie bien épuisée avant reset

    resetRateLimiterStateForTests();

    // Même clé, littéralement identique — doit repartir de zéro.
    const afterReset = getRateLimiter().consume('exhaust-me', 3, 3600);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(2);
  });

  it('restaure le provider en mémoire par défaut si un provider de test avait été installé', () => {
    const fakeProvider: RateLimiter = {
      consume: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 999 }),
    };
    setRateLimiter(fakeProvider);
    expect(getRateLimiter().consume('any-key', 5, 60).retryAfterSeconds).toBe(999);

    resetRateLimiterStateForTests();

    // Le provider par défaut se comporte normalement (n'est plus le faux
    // provider qui bloquait systématiquement avec 999s).
    const result = getRateLimiter().consume('any-key', 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});
