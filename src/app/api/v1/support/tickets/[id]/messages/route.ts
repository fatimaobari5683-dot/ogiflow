import { NextRequest, NextResponse } from 'next/server';
import { requireTicketAccess } from '@/shared/http/auth-context';
import { addMessageSchema } from '@/modules/support/support.validators';
import { addMessage } from '@/modules/support/support.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requireTicketAccess(req, params.id);
    const body = await req.json();
    const { body: messageBody } = addMessageSchema.parse(body);
    const message = await addMessage(params.id, context.userId, messageBody);
    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'SUPPORT_MESSAGE_CREATE_ERROR');
  }
}
