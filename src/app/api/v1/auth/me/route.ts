import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';
import { getAuthContext } from '@/shared/http/auth-context';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: context.userId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, mfaEnabled: true },
    });
    return NextResponse.json({ success: true, data: user });
  } catch (err) {
    return toErrorResponse(err, 'AUTH_ME_ERROR');
  }
}
