import { prisma } from '@/infrastructure/database/client';
import type { TicketStatus } from '@prisma/client';

export class SupportError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SupportError';
    this.statusCode = statusCode;
  }
}

const TICKET_LIST_SELECT = {
  id: true,
  subject: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { firstName: true, lastName: true, role: true } },
  assignedTo: { select: { firstName: true, lastName: true } },
  relatedOrder: { select: { orderNumber: true } },
} as const;

export async function createTicket(
  createdById: string,
  input: { subject: string; description: string; relatedOrderId?: string }
) {
  return prisma.supportTicket.create({
    data: {
      createdById,
      subject: input.subject,
      description: input.description,
      relatedOrderId: input.relatedOrderId,
    },
  });
}

/** Tickets ouverts par l'utilisateur — pour son propre espace ("Mes demandes"). */
export async function listMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { createdById: userId },
    select: TICKET_LIST_SELECT,
    orderBy: { updatedAt: 'desc' },
  });
}

/** File d'attente complète — réservé aux agents (SUPPORT_MANAGE). */
export async function listAllTickets(filter: { status?: TicketStatus } = {}) {
  return prisma.supportTicket.findMany({
    where: { status: filter.status },
    select: TICKET_LIST_SELECT,
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getTicketDetail(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      relatedOrder: { select: { id: true, orderNumber: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { firstName: true, lastName: true, role: true } } },
      },
    },
  });
  if (!ticket) {
    throw new SupportError('Ticket introuvable.', 404);
  }
  return ticket;
}

/**
 * Un message sur un ticket RESOLVED/CLOSED le rouvre automatiquement — sinon
 * une réponse tardive du client (ou une relance de l'agent) se perdrait
 * silencieusement dans un fil que plus personne ne surveille.
 */
export async function addMessage(ticketId: string, authorId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { status: true } });
  if (!ticket) {
    throw new SupportError('Ticket introuvable.', 404);
  }

  const shouldReopen = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId, authorId, body } }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: shouldReopen ? { status: 'OPEN' } : {},
    }),
  ]);

  return message;
}

export async function assignTicket(ticketId: string, assignedToId: string, actorId: string) {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });

  const [updated] = await prisma.$transaction([
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedToId, status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: 'SUPPORT_TICKET_ASSIGNED',
        entityType: 'SupportTicket',
        entityId: ticketId,
        beforeState: { assignedToId: ticket.assignedToId },
        afterState: { assignedToId },
      },
    }),
  ]);

  return updated;
}

/**
 * Agents éligibles à une assignation — les seuls rôles disposant de
 * SUPPORT_MANAGE (voir permissions.ts). Pas de module de gestion des comptes
 * internes dans LogiFlow à ce jour ; cette liste reste donc courte et gérée
 * par le seed, ce qui suffit tant qu'il n'y a pas d'écran dédié.
 */
export async function listSupportAgents() {
  return prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'SUPPORT_AGENT'] } },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: { firstName: 'asc' },
  });
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus, actorId: string) {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });

  const [updated] = await prisma.$transaction([
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: 'SUPPORT_TICKET_STATUS_CHANGED',
        entityType: 'SupportTicket',
        entityId: ticketId,
        beforeState: { status: ticket.status },
        afterState: { status },
      },
    }),
  ]);

  return updated;
}
