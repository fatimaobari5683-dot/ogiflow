import { NextRequest, NextResponse } from 'next/server';
import { disableMfaSchema } from '@/modules/auth/auth.validators';
import { disableMfa } from '@/modules/auth/auth.service';
import { getAuthContext } from '@/shared/http/auth-context';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const body = await req.json();
    const input = disableMfaSchema.parse(body);

    await disableMfa(context.userId, input.password);

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, 'MFA_DISABLE_ERROR');
  }
}
