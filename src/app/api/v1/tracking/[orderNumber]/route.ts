import { NextRequest, NextResponse } from 'next/server';
import { getPublicTracking } from '@/modules/tracking/tracking.service';
import { toErrorResponse } from '@/shared/http/api-error';
import { checkRateLimit, extractClientIp, RateLimitError } from '@/infrastructure/rate-limit/rate-limiter';

// Endpoint public, sans identifiant de compte — clé par IP uniquement (voir
// rate-limiter.ts). Ne jamais limiter par orderNumber : un client légitime
// qui rafraîchit sa propre page de suivi est un usage normal et attendu, pas
// un abus.
const TRACKING_WINDOW_SECONDS = 60;
const TRACKING_IP_LIMIT = 30;

/**
 * Endpoint public — pas d'authentification. Alimente le portail de suivi
 * client (section 15 du plan produit) : `logiflow.com/track/:orderNumber`.
 */
export async function GET(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  try {
    const ip = extractClientIp(req);
    checkRateLimit([{ key: `tracking:ip:${ip}`, limit: TRACKING_IP_LIMIT, windowSeconds: TRACKING_WINDOW_SECONDS }]);

    const tracking = await getPublicTracking(params.orderNumber);
    return NextResponse.json({ success: true, data: tracking });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', retryAfterSeconds: err.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } }
      );
    }
    return toErrorResponse(err, 'TRACKING_ERROR');
  }
}
