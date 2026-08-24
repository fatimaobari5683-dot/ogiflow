import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { submitSettlementForPayment } from '@/modules/settlements/settlements.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(req, Permission.SETTLEMENTS_MANAGE);
    const settlement = await submitSettlementForPayment(params.id);
    return NextResponse.json({ success: true, data: settlement });
  } catch (err) {
    return toErrorResponse(err, 'SETTLEMENT_SUBMIT_ERROR');
  }
}
