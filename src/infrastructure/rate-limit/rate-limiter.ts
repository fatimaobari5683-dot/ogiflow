import { createHash } from 'crypto';

/**
 * Abstraction de limitation de débit (rate limiting) — même principe que
 * NotificationProvider (notifications.service.ts) et DocumentStorage
 * (document-storage.ts) : une interface swappable, un seul provider actif
 * pour l'instant (en mémoire), remplaçable par un backend distribué (Redis)
 * derrière la même interface sans toucher aux appelants, le jour où une
 * vraie topologie multi-instance l'exigera.
 *
 * PORTÉE VOLONTAIREMENT LIMITÉE (premier jet — voir CLAUDE.md) :
 * - fenêtre fixe (pas de fenêtre glissante) : plus simple à raisonner et à
 *   tester, suffisant pour ce premier déploiement.
 * - stockage en mémoire du processus Node — ne survit pas à un redémarrage
 *   et n'est PAS partagé entre plusieurs instances/conteneurs. Acceptable
 *   tant que LogiFlow tourne en instance unique (aucune topologie de
 *   production multi-instance n'existe aujourd'hui — voir CLAUDE.md §15).
 *   Redis est installé mais délibérément non utilisé ici : introduire une
 *   dépendance d'exécution réelle sur Redis est une décision d'architecture
 *   à prendre explicitement (CLAUDE.md §13), pas un choix par défaut parce
 *   que le paquet est déjà là.
 * - toutes les tentatives comptent dans chaque bucket concerné (pas de
 *   distinction "échec seulement", pas de remise à zéro sur succès) : garde
 *   ce premier jet déterministe et indépendant de la logique succès/échec
 *   des appelants (ex: auth.service.ts). Une évolution future pourra
 *   affiner ce comportement si un besoin réel apparaît.
 */

// ============================================================================
// Interface swappable + implémentation en mémoire
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Toujours 0 quand `allowed` est true. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
}

/**
 * Cadence du balayage opportuniste des buckets expirés (voir
 * sweepExpiredBuckets) — un balayage toutes les N vérifications, pas à
 * chaque requête : évite de parcourir tout le Map à chaque appel tout en
 * garantissant qu'une clé abandonnée (jamais revisitée après expiration)
 * finit par être libérée. Pas de timer/intervalle : le balayage ne se
 * déclenche que si le limiteur est effectivement sollicité.
 */
export const RATE_LIMIT_SWEEP_INTERVAL_CHECKS = 100;

/**
 * Singleton `global.*` — même principe que le bus d'événements
 * (src/infrastructure/messaging/event-bus.ts) et le client Prisma
 * (infrastructure/database/client.ts) : Next.js peut compiler les routes
 * API en graphes de modules distincts, ce qui ferait apparaître plusieurs
 * instances indépendantes (Map, compteur, provider actif) si cet état était
 * une simple variable de module — exactement la classe de bug déjà
 * rencontrée (et corrigée) sur le bus d'événements, silencieuse et sans
 * erreur. Les trois éléments d'état partagé (buckets, compteur de balayage,
 * provider actif) suivent tous la même règle : rien ici ne doit redevenir
 * une variable de module ordinaire.
 */
declare global {
  // eslint-disable-next-line no-var
  var __rateLimitBuckets: Map<string, Bucket> | undefined;
  // eslint-disable-next-line no-var
  var __rateLimitSweepCounter: number | undefined;
  // eslint-disable-next-line no-var
  var __rateLimitActiveLimiter: RateLimiter | undefined;
}

function getStore(): Map<string, Bucket> {
  if (!global.__rateLimitBuckets) {
    global.__rateLimitBuckets = new Map();
  }
  return global.__rateLimitBuckets;
}

/**
 * Retire du Map toute entrée déjà expirée. Comportement strictement
 * transparent pour les appelants : une entrée expirée jamais balayée est de
 * toute façon traitée comme "fenêtre expirée, on repart à zéro" par
 * `consume` (voir la condition `!existing || existing.resetAt <= now`) — la
 * balayer plus tôt ne change donc jamais le résultat d'un appel, seulement
 * la taille du Map en mémoire.
 */
function sweepExpiredBuckets(store: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

/** Incrémente et renvoie le compteur global de vérifications (voir RATE_LIMIT_SWEEP_INTERVAL_CHECKS). */
function nextSweepTick(): number {
  global.__rateLimitSweepCounter = (global.__rateLimitSweepCounter ?? 0) + 1;
  return global.__rateLimitSweepCounter;
}

class InMemoryRateLimiter implements RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): RateLimitResult {
    const store = getStore();
    const now = Date.now();

    if (nextSweepTick() % RATE_LIMIT_SWEEP_INTERVAL_CHECKS === 0) {
      sweepExpiredBuckets(store, now);
    }

    const existing = store.get(key);

    if (!existing || existing.resetAt <= now) {
      // Nouvelle fenêtre (première requête pour cette clé, ou fenêtre
      // précédente expirée — balayée ou non, le résultat est identique) —
      // chaque appel consomme toujours une unité, conformément à la règle
      // "toutes les tentatives comptent".
      store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds: 0 };
  }
}

function getActiveLimiter(): RateLimiter {
  if (!global.__rateLimitActiveLimiter) {
    global.__rateLimitActiveLimiter = new InMemoryRateLimiter();
  }
  return global.__rateLimitActiveLimiter;
}

/** Permet de brancher un provider distribué (Redis, etc.) sans modifier les appelants. */
export function setRateLimiter(limiter: RateLimiter): void {
  global.__rateLimitActiveLimiter = limiter;
}

export function getRateLimiter(): RateLimiter {
  return getActiveLimiter();
}

/**
 * RÉSERVÉ AUX TESTS. Vide l'état global du limiteur (buckets, compteur de
 * balayage, provider actif restauré à l'implémentation en mémoire par
 * défaut) — nécessaire car cet état `global.*` survit d'un test à l'autre
 * dans le même worker Vitest (il n'est pas réinitialisé par l'isolation de
 * module par fichier), exactement comme le bus d'événements a dû gérer le
 * même problème dans son propre test de régression.
 */
export function resetRateLimiterStateForTests(): void {
  global.__rateLimitBuckets = new Map();
  global.__rateLimitSweepCounter = 0;
  global.__rateLimitActiveLimiter = new InMemoryRateLimiter();
}

/** RÉSERVÉ AUX TESTS. Nombre de buckets actuellement en mémoire (preuve d'éviction). */
export function __getRateLimitBucketCountForTests(): number {
  return getStore().size;
}

// ============================================================================
// Erreur + vérification composite
// ============================================================================

/**
 * `statusCode` explicite — même convention que AuthError/DeliveryError/
 * DispatchError/etc., déjà gérée génériquement par toErrorResponse
 * (src/shared/http/api-error.ts). Le `Retry-After` HTTP (obligatoire pour
 * un 429 correctement formé) n'est en revanche PAS ajouté par
 * toErrorResponse aujourd'hui — les trois routes concernées gèrent ce cas
 * précis localement plutôt que d'élargir le système d'erreurs global pour
 * un seul en-tête.
 */
export class RateLimitError extends Error {
  statusCode = 429;
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Trop de requêtes. Réessayez plus tard.');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RateLimitCheck {
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Vérifie une ou plusieurs limites en une fois. Chaque bucket listé est
 * TOUJOURS consommé (une tentative compte pour tous les buckets concernés,
 * qu'elle soit finalement acceptée ou non) ; si au moins un bucket est
 * dépassé, lève RateLimitError avec le délai d'attente le plus long parmi
 * les buckets dépassés.
 */
export function checkRateLimit(checks: RateLimitCheck[]): void {
  const limiter = getRateLimiter();
  let blocked = false;
  let maxRetryAfter = 0;

  for (const check of checks) {
    const result = limiter.consume(check.key, check.limit, check.windowSeconds);
    if (!result.allowed) {
      blocked = true;
      maxRetryAfter = Math.max(maxRetryAfter, result.retryAfterSeconds);
    }
  }

  if (blocked) {
    throw new RateLimitError(maxRetryAfter);
  }
}

// ============================================================================
// Clé de rate-limit bornée pour une valeur arbitraire (ex: identifiant de
// connexion) — jamais la valeur brute
// ============================================================================

/**
 * Dérive une clé de bucket bornée et déterministe à partir d'une valeur
 * arbitraire (typiquement déjà normalisée par l'appelant — trim/lowercase).
 * Utilisé pour tout élément de clé qui provient directement d'une entrée
 * utilisateur sans limite de longueur imposée par son schéma de validation
 * (ex: `loginSchema.identifier`, qui n'a pas de `.max()`) : utiliser cette
 * valeur telle quelle comme clé de Map permettrait à un attaquant de créer
 * un nombre illimité d'entrées distinctes, jamais nettoyées, simplement en
 * variant la chaîne envoyée à chaque requête.
 *
 * SHA-256 (module natif `crypto`, aucune dépendance ajoutée) : déterministe
 * (même entrée → même sortie, donc même bucket), longueur de sortie
 * toujours fixe (64 caractères hexadécimaux) quelle que soit la longueur de
 * l'entrée, et deux entrées distinctes produisent en pratique toujours des
 * clés distinctes. La valeur brute ne doit JAMAIS être journalisée ni
 * réapparaître dans la clé résultante — seul le digest est utilisé.
 */
export function hashForRateLimitKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ============================================================================
// Extraction de l'IP cliente
// ============================================================================

/**
 * LIMITE DE CONFIANCE IMPORTANTE — à ne jamais perdre de vue :
 *
 * Ce dépôt n'a AUCUNE topologie de reverse proxy de production définie
 * aujourd'hui (pas de Dockerfile applicatif, pas de configuration de
 * déploiement — voir CLAUDE.md §15). `X-Forwarded-For` est un en-tête
 * entièrement contrôlable par le client tant qu'aucun proxy de confiance ne
 * le réécrit avant d'atteindre ce processus : il n'est PAS
 * cryptographiquement fiable, et cette fonction ne prétend pas le
 * contraire. C'est une meilleure estimation conservatrice, suffisante pour
 * freiner un abus non sophistiqué (scripts, scans automatisés), pas une
 * preuve d'identité réseau — un attaquant qui connaît cette limite peut la
 * contourner en changeant la valeur de l'en-tête à chaque requête tant
 * qu'aucun proxy de confiance n'est en place devant l'application.
 *
 * Volontairement, pour ce premier jet :
 * - pas de configuration de "nombre de sauts de confiance" (aucune
 *   topologie n'existe encore pour la justifier) ;
 * - prend systématiquement le PREMIER segment de la chaîne
 *   `X-Forwarded-For` (convention la plus répandue pour désigner le client
 *   d'origine) — sachant que c'est aussi le segment le plus facilement
 *   falsifiable en l'absence de proxy de confiance ;
 * - ne lève jamais d'exception et n'exempte jamais une requête du
 *   rate-limiting simplement parce qu'aucune IP exploitable n'a été
 *   trouvée : elle tombe alors dans un bucket "unknown" partagé, limité
 *   comme n'importe quel autre.
 */
const UNKNOWN_IP_BUCKET = 'unknown';

// Ni une validation RFC stricte d'adresse IP, ni son objectif : seulement
// écarter une valeur structurellement absurde (trop longue, caractères
// impossibles) pour qu'elle ne serve jamais de clé de bucket dégénérée —
// un attaquant qui enverrait une valeur unique et énorme à chaque requête
// ne doit pas pouvoir créer un nombre illimité de buckets distincts.
const MAX_IP_LENGTH = 45; // couvre une IPv6 complète avec zone-id, marge incluse
const PLAUSIBLE_IP_PATTERN = /^[0-9a-fA-F:.[\]%]+$/;

export interface RequestLike {
  headers: { get(name: string): string | null };
}

export function extractClientIp(req: RequestLike): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Chaîne potentielle "client, proxy1, proxy2" — voir l'avertissement de
    // confiance ci-dessus sur la fiabilité de ce premier segment.
    const candidate = forwardedFor.split(',')[0]?.trim();
    if (candidate && isPlausibleIp(candidate)) {
      return normalizeIp(candidate);
    }
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    const trimmed = realIp.trim();
    if (isPlausibleIp(trimmed)) {
      return normalizeIp(trimmed);
    }
  }

  return UNKNOWN_IP_BUCKET;
}

function isPlausibleIp(value: string): boolean {
  if (value.length === 0 || value.length > MAX_IP_LENGTH) return false;
  return PLAUSIBLE_IP_PATTERN.test(value);
}

function normalizeIp(value: string): string {
  // Retire les crochets IPv6 (`[::1]` → `::1`) et met en minuscules (IPv6
  // est insensible à la casse) pour qu'une même adresse ne crée jamais deux
  // buckets distincts selon sa représentation textuelle.
  return value.replace(/^\[|\]$/g, '').toLowerCase();
}
