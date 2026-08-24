import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { createOfferSchema } from '@/modules/dispatch/offers.validators';
import { createOffer, offerToNextBestDriver } from '@/modules/dispatch/offers.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Propose une mission à un livreur (ou au meilleur candidat restant si aucun
 * driverId n'est fourni) — le livreur doit ensuite accepter via
 * POST /api/v1/offers/[id]/accept. Complète l'assignation directe existante
 * (`/dispatch/orders/[orderId]/assign`) sans la remplacer.
 */
export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    await requirePermission(req, Permission.DISPATCH_MANAGE);
    const body = await req.json().catch(() => ({}));

    const offer = body?.driverId
      ? await createOffer(params.orderId, createOfferSchema.parse(body).driverId)
      : await offerToNextBestDriver(params.orderId);

    return NextResponse.json({ success: true, data: offer }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'DISPATCH_OFFER_ERROR');
  }
}
