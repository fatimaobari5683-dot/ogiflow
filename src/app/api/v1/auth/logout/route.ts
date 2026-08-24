import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, logout } from '@/modules/auth/auth.service';
import { toErrorResponse } from '@/shared/http/api-error';

const SESSION_COOKIE = 'logiflow_session';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      try {
        const payload = await verifyToken(token);
        await logout(payload.sessionId);
      } catch {
        // Session déjà invalide/expirée : rien à révoquer, on efface quand même le cookie.
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  } catch (err) {
    return toErrorResponse(err, 'AUTH_LOGOUT_ERROR');
  }
}
