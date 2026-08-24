import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { setPromoCodeActive } from '@/modules/promotions/promotions.service';
import { toErrorResponse } from '@/shared/http/api-error';

const toggleSchema = z.object({ isActive: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(req, Permission.PROMOTIONS_MANAGE);
    const body = await req.json();
    const { isActive } = toggleSchema.parse(body);
    const code = await setPromoCodeActive(params.id, isActive);
    return NextResponse.json({ success: true, data: code });
  } catch (err) {
    return toErrorResponse(err, 'PROMO_UPDATE_ERROR');
  }
}
