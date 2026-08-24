import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { hasPermission, Permission } from '@/shared/constants/permissions';
import { createTicketSchema } from '@/modules/support/support.validators';
import { createTicket, listMyTickets, listAllTickets } from '@/modules/support/support.service';
import { toErrorResponse } from '@/shared/http/api-error';
import type { TicketStatus } from '@prisma/client';

const VALID_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const body = await req.json();
    const input = createTicketSchema.parse(body);
    const ticket = await createTicket(context.userId, input);
    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'SUPPORT_TICKET_CREATE_ERROR');
  }
}

/**
 * Un agent (SUPPORT_MANAGE) voit toute la file, filtrable par statut ;
 * tout autre utilisateur authentifié ne voit que ses propres demandes.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const statusParam = new URL(req.url).searchParams.get('status');
    const status = statusParam && VALID_STATUSES.includes(statusParam as TicketStatus) ? (statusParam as TicketStatus) : undefined;

    const tickets = hasPermission(context.role, Permission.SUPPORT_MANAGE)
      ? await listAllTickets({ status })
      : await listMyTickets(context.userId);

    return NextResponse.json({ success: true, data: tickets });
  } catch (err) {
    return toErrorResponse(err, 'SUPPORT_TICKET_LIST_ERROR');
  }
}
