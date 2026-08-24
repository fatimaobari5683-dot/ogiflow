import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { rejectApplicationSchema } from '@/modules/onboarding/onboarding.validators';
import { rejectSupplier } from '@/modules/onboarding/onboarding.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requirePermission(req, Permission.SUPPLIERS_MANAGE);
    const { reason } = rejectApplicationSchema.parse(await req.json());
    const supplier = await rejectSupplier(params.id, context.userId, reason);
    return NextResponse.json({ success: true, data: supplier });
  } catch (err) {
    return toErrorResponse(err, 'SUPPLIER_REJECT_ERROR');
  }
}
