import { NextRequest, NextResponse } from 'next/server';
import { requireTicketAccess, requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { updateTicketStatusSchema, assignTicketSchema } from '@/modules/support/support.validators';
import { getTicketDetail, updateTicketStatus, assignTicket } from '@/modules/support/support.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireTicketAccess(req, params.id);
    const ticket = await getTicketDetail(params.id);
    return NextResponse.json({ success: true, data: ticket });
  } catch (err) {
    return toErrorResponse(err, 'SUPPORT_TICKET_DETAIL_ERROR');
  }
}

/**
 * Changement de statut et/ou assignation — réservé aux agents. Les deux
 * actions sont volontairement séparées en base (deux fonctions de service,
 * deux entrées d'audit distinctes) même si la route accepte les deux en une
 * seule requête, pour rester honnête sur ce qui a réellement changé.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requirePermission(req, Permission.SUPPORT_MANAGE);
    const body = await req.json();

    if ('status' in body) {
      const { status } = updateTicketStatusSchema.parse(body);
      await updateTicketStatus(params.id, status, context.userId);
    }
    if ('assignedToId' in body) {
      const { assignedToId } = assignTicketSchema.parse(body);
      await assignTicket(params.id, assignedToId, context.userId);
    }

    const ticket = await getTicketDetail(params.id);
    return NextResponse.json({ success: true, data: ticket });
  } catch (err) {
    return toErrorResponse(err, 'SUPPORT_TICKET_UPDATE_ERROR');
  }
}
