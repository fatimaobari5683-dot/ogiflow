import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { loginSchema } from '@/modules/auth/auth.validators';
import { login, AuthError } from '@/modules/auth/auth.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = loginSchema.parse(body);

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const result = await login(input, { ip: ip ?? undefined, userAgent });

    const response = NextResponse.json({ success: true, data: { user: result.user } });
    // Cookie httpOnly : le token n'est jamais accessible en JS côté client (protection XSS).
    response.cookies.set('logiflow_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', details: err.flatten() },
        { status: 422 }
      );
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('[LOGIN_ERROR]', err);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}
