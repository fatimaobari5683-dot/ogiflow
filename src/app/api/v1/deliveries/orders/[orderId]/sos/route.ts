import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { triggerDriverSos } from '@/modules/operations/exceptions.service';
import { toErrorResponse } from '@/shared/http/api-error';

const sosSchema = z.object({ note: z.string().max(500).optional() });

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const body = await req.json().catch(() => ({}));
    const { note } = sosSchema.parse(body);
    const exception = await triggerDriverSos(params.orderId, note, { actorId: context.userId, actorRole: context.role });
    return NextResponse.json({ success: true, data: exception }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_SOS_ERROR');
  }
}
