import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { listOrderTransactions } from '@/modules/payments/payments.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    await requireAnyPermission(req, [Permission.PAYMENTS_MANAGE, Permission.ORDERS_VIEW_ALL]);
    const transactions = await listOrderTransactions(params.orderId);
    return NextResponse.json({ success: true, data: transactions });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_TRANSACTIONS_ERROR');
  }
}
