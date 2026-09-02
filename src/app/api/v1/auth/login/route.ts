import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { loginSchema } from '@/modules/auth/auth.validators';
import { login, AuthError } from '@/modules/auth/auth.service';
import {
  checkRateLimit,
  extractClientIp,
  hashForRateLimitKey,
  RateLimitError,
} from '@/infrastructure/rate-limit/rate-limiter';

// Premier jet volontairement simple (voir rate-limiter.ts) : TOUTES les
// tentatives comptent dans les deux buckets, qu'elles réussissent ou
// échouent — pas de distinction "échecs uniquement", pas de remise à zéro
// sur succès. Deux buckets indépendants : un par IP (attrape le
// bombardement dispersé sur de nombreux comptes depuis une seule source) et
// un par identifiant normalisé (attrape le bourrage d'identifiants ciblant
// un seul compte depuis de nombreuses IP) — soit l'un, soit l'autre bloque.
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_IP_LIMIT = 10;
const LOGIN_IDENTIFIER_LIMIT = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = loginSchema.parse(body);

    // Extraction dédiée au rate-limiting (voir rate-limiter.ts pour les
    // limites de confiance) — distincte de l'extraction ci-dessous, qui
    // alimente Session/AuditLog et dont le format existant est préservé
    // tel quel.
    const rateLimitIp = extractClientIp(req);
    // Même normalisation qu'avant (trim + minuscules) — seule la clé de
    // stockage change : `loginSchema.identifier` n'a pas de longueur
    // maximale, donc utiliser la valeur brute (même normalisée) comme clé de
    // Map permettrait à un attaquant de créer un nombre illimité d'entrées
    // jamais nettoyées en variant la chaîne à chaque requête. Le hash borne
    // la clé à une longueur fixe sans jamais stocker l'identifiant en clair
    // (voir hashForRateLimitKey, rate-limiter.ts).
    const normalizedIdentifier = input.identifier.trim().toLowerCase();
    const identifierKey = `login:identifier:${hashForRateLimitKey(normalizedIdentifier)}`;

    checkRateLimit([
      { key: `login:ip:${rateLimitIp}`, limit: LOGIN_IP_LIMIT, windowSeconds: LOGIN_WINDOW_SECONDS },
      { key: identifierKey, limit: LOGIN_IDENTIFIER_LIMIT, windowSeconds: LOGIN_WINDOW_SECONDS },
    ]);

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const result = await login(input, { ip: ip ?? undefined, userAgent });

    const response = NextResponse.json({ success: true, data: { user: result.user } });
    // Cookie httpOnly : le token n'est jamais accessible en JS côté client (protection XSS).
    response.cookies.set('logiflow_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Réponse volontairement générique : ne révèle jamais si le blocage
      // vient du bucket IP ou du bucket identifiant, ni si l'identifiant
      // correspond à un compte existant — gérée localement plutôt que
      // d'élargir toErrorResponse pour ce seul en-tête Retry-After.
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', retryAfterSeconds: err.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } }
      );
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', details: err.flatten() },
        { status: 422 }
      );
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('[LOGIN_ERROR]', err);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}
