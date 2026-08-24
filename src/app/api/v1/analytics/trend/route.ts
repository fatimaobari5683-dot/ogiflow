import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getOrdersTrend } from '@/modules/analytics/analytics.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, Permission.ANALYTICS_VIEW);
    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(searchParams.get('days')) || 14));
    const trend = await getOrdersTrend(days);
    return NextResponse.json({ success: true, data: trend });
  } catch (err) {
    return toErrorResponse(err, 'ANALYTICS_TREND_ERROR');
  }
}
