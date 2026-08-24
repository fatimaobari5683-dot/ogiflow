import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { createPromoCodeSchema } from '@/modules/promotions/promotions.validators';
import { createPromoCode, listPromoCodes } from '@/modules/promotions/promotions.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, Permission.PROMOTIONS_MANAGE);
    const codes = await listPromoCodes();
    return NextResponse.json({ success: true, data: codes });
  } catch (err) {
    return toErrorResponse(err, 'PROMO_LIST_ERROR');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, Permission.PROMOTIONS_MANAGE);
    const body = await req.json();
    const input = createPromoCodeSchema.parse(body);
    const code = await createPromoCode({
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });
    return NextResponse.json({ success: true, data: code }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'PROMO_CREATE_ERROR');
  }
}
