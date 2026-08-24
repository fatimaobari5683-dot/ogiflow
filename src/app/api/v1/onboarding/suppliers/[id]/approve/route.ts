import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { approveSupplier } from '@/modules/onboarding/onboarding.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requirePermission(req, Permission.SUPPLIERS_MANAGE);
    const supplier = await approveSupplier(params.id, context.userId);
    return NextResponse.json({ success: true, data: supplier });
  } catch (err) {
    return toErrorResponse(err, 'SUPPLIER_APPROVE_ERROR');
  }
}
