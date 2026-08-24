import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getDashboardSummary } from '@/modules/analytics/analytics.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, Permission.ANALYTICS_VIEW);
    const summary = await getDashboardSummary();
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    return toErrorResponse(err, 'ANALYTICS_DASHBOARD_ERROR');
  }
}
