import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { listNotificationsQuerySchema } from '@/modules/notifications/notifications.validators';
import { listNotifications } from '@/modules/notifications/notifications.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requireAnyPermission(req, [Permission.SUPPORT_MANAGE, Permission.USERS_MANAGE]);

    const { searchParams } = new URL(req.url);
    const { userId, status } = listNotificationsQuerySchema.parse({
      userId: searchParams.get('userId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    const notifications = await listNotifications({ userId, status });
    return NextResponse.json({ success: true, data: notifications });
  } catch (err) {
    return toErrorResponse(err, 'NOTIFICATIONS_LIST_ERROR');
  }
}
