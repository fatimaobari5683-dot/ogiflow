import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { sendMessageSchema } from '@/modules/messaging/messaging.validators';
import { listOrderMessages, sendDriverMessage } from '@/modules/messaging/order-chat.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const messages = await listOrderMessages(params.orderId);
    return NextResponse.json({ success: true, data: messages });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_CHAT_LIST_ERROR');
  }
}

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const body = await req.json();
    const { body: messageBody } = sendMessageSchema.parse(body);
    const message = await sendDriverMessage(params.orderId, { actorId: context.userId, actorRole: context.role }, messageBody);
    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_CHAT_SEND_ERROR');
  }
}
