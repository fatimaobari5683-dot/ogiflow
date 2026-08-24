import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { generateMfaSecret } from '@/modules/auth/auth.service';
import { getAuthContext } from '@/shared/http/auth-context';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const { secret, otpauthUrl } = await generateMfaSecret(context.userId);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({ success: true, data: { secret, otpauthUrl, qrCodeDataUrl } });
  } catch (err) {
    return toErrorResponse(err, 'MFA_SETUP_ERROR');
  }
}
