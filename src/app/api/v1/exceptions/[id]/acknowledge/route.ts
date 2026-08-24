import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { acknowledgeException } from '@/modules/operations/exceptions.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requirePermission(req, Permission.EXCEPTIONS_MANAGE);
    const exception = await acknowledgeException(params.id, context.userId);
    return NextResponse.json({ success: true, data: exception });
  } catch (err) {
    return toErrorResponse(err, 'EXCEPTION_ACKNOWLEDGE_ERROR');
  }
}
