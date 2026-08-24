import { NextRequest, NextResponse } from 'next/server';
import { changePasswordSchema } from '@/modules/auth/auth.validators';
import { changePassword } from '@/modules/auth/auth.service';
import { getAuthContext } from '@/shared/http/auth-context';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const body = await req.json();
    const input = changePasswordSchema.parse(body);

    await changePassword(context.userId, input.currentPassword, input.newPassword, context.sessionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, 'CHANGE_PASSWORD_ERROR');
  }
}
