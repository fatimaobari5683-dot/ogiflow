import { NextRequest, NextResponse } from 'next/server';
import { submitReviewSchema } from '@/modules/tracking/tracking.validators';
import { submitDeliveryReview } from '@/modules/tracking/tracking.service';
import { toErrorResponse } from '@/shared/http/api-error';
import { checkRateLimit, extractClientIp, RateLimitError } from '@/infrastructure/rate-limit/rate-limiter';

// Clé par IP uniquement (voir rate-limiter.ts) — l'invariant "un seul avis
// par commande" reste porté par la contrainte unique sur DeliveryReview.orderId
// (submitDeliveryReview), pas par ce rate-limit, qui sert seulement à
// freiner le spam/la répétition de requêtes.
const REVIEW_WINDOW_SECONDS = 10 * 60;
const REVIEW_IP_LIMIT = 10;

/**
 * Endpoint public — pas d'authentification, même principe que le reste du
 * tracking (voir tracking.service.ts) : le numéro de commande en tient lieu.
 */
export async function POST(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  try {
    const ip = extractClientIp(req);
    checkRateLimit([
      { key: `tracking-review:ip:${ip}`, limit: REVIEW_IP_LIMIT, windowSeconds: REVIEW_WINDOW_SECONDS },
    ]);

    const body = await req.json();
    const { rating, comment } = submitReviewSchema.parse(body);
    const review = await submitDeliveryReview(params.orderNumber, rating, comment);
    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', retryAfterSeconds: err.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } }
      );
    }
    return toErrorResponse(err, 'DELIVERY_REVIEW_ERROR');
  }
}
