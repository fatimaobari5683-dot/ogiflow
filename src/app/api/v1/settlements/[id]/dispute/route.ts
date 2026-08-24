import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { disputeSettlement } from '@/modules/settlements/settlements.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(req, Permission.SETTLEMENTS_MANAGE);
    const settlement = await disputeSettlement(params.id);
    return NextResponse.json({ success: true, data: settlement });
  } catch (err) {
    return toErrorResponse(err, 'SETTLEMENT_DISPUTE_ERROR');
  }
}
