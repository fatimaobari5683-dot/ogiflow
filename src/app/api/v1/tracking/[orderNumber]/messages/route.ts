import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';
import { sendMessageSchema } from '@/modules/messaging/messaging.validators';
import { listOrderMessages, sendCustomerMessage } from '@/modules/messaging/order-chat.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Endpoints publics — pas d'authentification, même principe que le reste du
 * tracking (voir tracking.service.ts) : le numéro de commande en tient lieu.
 */
export async function GET(_req: NextRequest, { params }: { params: { orderNumber: string } }) {
  try {
    const order = await prisma.order.findUnique({ where: { orderNumber: params.orderNumber }, select: { id: true } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable.' }, { status: 404 });
    }
    const messages = await listOrderMessages(order.id);
    return NextResponse.json({ success: true, data: messages });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_CHAT_LIST_ERROR');
  }
}

export async function POST(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  try {
    const body = await req.json();
    const { body: messageBody } = sendMessageSchema.parse(body);
    const message = await sendCustomerMessage(params.orderNumber, messageBody);
    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_CHAT_SEND_ERROR');
  }
}
