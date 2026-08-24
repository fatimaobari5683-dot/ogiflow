import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { listExceptionsQuerySchema } from '@/modules/operations/exceptions.validators';
import { listExceptions } from '@/modules/operations/exceptions.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, Permission.EXCEPTIONS_MANAGE);
    const query = listExceptionsQuerySchema.parse({
      status: req.nextUrl.searchParams.get('status') ?? undefined,
    });
    const exceptions = await listExceptions(query);
    return NextResponse.json({ success: true, data: exceptions });
  } catch (err) {
    return toErrorResponse(err, 'EXCEPTIONS_LIST_ERROR');
  }
}
