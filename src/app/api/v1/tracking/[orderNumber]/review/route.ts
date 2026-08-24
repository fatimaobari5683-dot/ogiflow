import { NextRequest, NextResponse } from 'next/server';
import { submitReviewSchema } from '@/modules/tracking/tracking.validators';
import { submitDeliveryReview } from '@/modules/tracking/tracking.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Endpoint public — pas d'authentification, même principe que le reste du
 * tracking (voir tracking.service.ts) : le numéro de commande en tient lieu.
 */
export async function POST(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  try {
    const body = await req.json();
    const { rating, comment } = submitReviewSchema.parse(body);
    const review = await submitDeliveryReview(params.orderNumber, rating, comment);
    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_REVIEW_ERROR');
  }
}
