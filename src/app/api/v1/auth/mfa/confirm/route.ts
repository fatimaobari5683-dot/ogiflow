import { NextRequest, NextResponse } from 'next/server';
import { mfaCodeSchema } from '@/modules/auth/auth.validators';
import { confirmMfaEnrollment } from '@/modules/auth/auth.service';
import { getAuthContext } from '@/shared/http/auth-context';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const body = await req.json();
    const input = mfaCodeSchema.parse(body);

    await confirmMfaEnrollment(context.userId, input.code);

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, 'MFA_CONFIRM_ERROR');
  }
}
