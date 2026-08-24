import { NextRequest, NextResponse } from 'next/server';
import { getPublicTracking } from '@/modules/tracking/tracking.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Endpoint public — pas d'authentification. Alimente le portail de suivi
 * client (section 15 du plan produit) : `logiflow.com/track/:orderNumber`.
 */
export async function GET(_req: NextRequest, { params }: { params: { orderNumber: string } }) {
  try {
    const tracking = await getPublicTracking(params.orderNumber);
    return NextResponse.json({ success: true, data: tracking });
  } catch (err) {
    return toErrorResponse(err, 'TRACKING_ERROR');
  }
}
