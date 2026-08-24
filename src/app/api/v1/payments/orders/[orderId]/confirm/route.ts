import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { confirmManualPayment } from '@/modules/payments/payments.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    await requirePermission(req, Permission.PAYMENTS_MANAGE);
    const payment = await confirmManualPayment(params.orderId);
    return NextResponse.json({ success: true, data: payment });
  } catch (err) {
    return toErrorResponse(err, 'PAYMENT_CONFIRM_ERROR');
  }
}
