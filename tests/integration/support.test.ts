import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createUser } from '../factories';
import {
  createTicket,
  listMyTickets,
  listAllTickets,
  getTicketDetail,
  addMessage,
  assignTicket,
  updateTicketStatus,
  listSupportAgents,
  SupportError,
} from '@/modules/support/support.service';

beforeEach(resetDatabase);

describe('createTicket / listMyTickets — demandes du créateur', () => {
  it('crée un ticket OPEN rattaché à son créateur', async () => {
    const driverUser = await createUser('DRIVER');
    const ticket = await createTicket(driverUser.id, { subject: 'Colis endommagé', description: 'Le carton était déchiré à la réception.' });

    expect(ticket.status).toBe('OPEN');
    expect(ticket.createdById).toBe(driverUser.id);
  });

  it("ne liste que les tickets du demandeur, pas ceux d'un autre utilisateur", async () => {
    const driverUser = await createUser('DRIVER');
    const otherUser = await createUser('SUPPLIER');
    await createTicket(driverUser.id, { subject: 'Sujet A', description: 'Description A suffisamment longue.' });
    await createTicket(otherUser.id, { subject: 'Sujet B', description: 'Description B suffisamment longue.' });

    const mine = await listMyTickets(driverUser.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toBe('Sujet A');
  });
});

describe('listAllTickets — file d\'attente agent', () => {
  it('liste tous les tickets, filtrable par statut', async () => {
    const user = await createUser('DRIVER');
    const t1 = await createTicket(user.id, { subject: 'Ouvert', description: 'Description suffisamment longue.' });
    const t2 = await createTicket(user.id, { subject: 'À résoudre', description: 'Description suffisamment longue.' });
    const agent = await createUser('SUPPORT_AGENT');
    await updateTicketStatus(t2.id, 'RESOLVED', agent.id);

    const all = await listAllTickets();
    expect(all.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());

    const resolvedOnly = await listAllTickets({ status: 'RESOLVED' });
    expect(resolvedOnly.map((t) => t.id)).toEqual([t2.id]);
  });
});

describe('getTicketDetail', () => {
  it('lève SupportError pour un ticket inconnu', async () => {
    await expect(getTicketDetail('inconnu')).rejects.toThrow(SupportError);
  });

  it('inclut les messages dans leur ordre chronologique', async () => {
    const user = await createUser('DRIVER');
    const agent = await createUser('SUPPORT_AGENT');
    const ticket = await createTicket(user.id, { subject: 'Sujet', description: 'Description suffisamment longue.' });
    await addMessage(ticket.id, user.id, 'Premier message');
    await addMessage(ticket.id, agent.id, 'Réponse agent');

    const detail = await getTicketDetail(ticket.id);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[0]!.body).toBe('Premier message');
    expect(detail.messages[1]!.body).toBe('Réponse agent');
  });
});

describe('addMessage — réouverture automatique', () => {
  it('rouvre un ticket RESOLVED/CLOSED dès qu\'un nouveau message arrive', async () => {
    const user = await createUser('DRIVER');
    const agent = await createUser('SUPPORT_AGENT');
    const ticket = await createTicket(user.id, { subject: 'Sujet', description: 'Description suffisamment longue.' });
    await updateTicketStatus(ticket.id, 'RESOLVED', agent.id);

    await addMessage(ticket.id, user.id, 'En fait le problème persiste');

    const reopened = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(reopened.status).toBe('OPEN');
  });

  it("ne touche pas au statut d'un ticket déjà OPEN ou IN_PROGRESS", async () => {
    const user = await createUser('DRIVER');
    const ticket = await createTicket(user.id, { subject: 'Sujet', description: 'Description suffisamment longue.' });

    await addMessage(ticket.id, user.id, 'Complément d\'info');

    const stillOpen = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stillOpen.status).toBe('OPEN');
  });
});

describe('assignTicket / updateTicketStatus — actions agent', () => {
  it('assigne un ticket et le fait passer de OPEN à IN_PROGRESS', async () => {
    const user = await createUser('DRIVER');
    const agent = await createUser('SUPPORT_AGENT');
    const ticket = await createTicket(user.id, { subject: 'Sujet', description: 'Description suffisamment longue.' });

    const updated = await assignTicket(ticket.id, agent.id, agent.id);
    expect(updated.assignedToId).toBe(agent.id);
    expect(updated.status).toBe('IN_PROGRESS');

    const audit = await prisma.auditLog.findFirst({ where: { entityId: ticket.id, action: 'SUPPORT_TICKET_ASSIGNED' } });
    expect(audit).toBeDefined();
  });

  it('change le statut et écrit une entrée d\'audit', async () => {
    const user = await createUser('DRIVER');
    const agent = await createUser('SUPPORT_AGENT');
    const ticket = await createTicket(user.id, { subject: 'Sujet', description: 'Description suffisamment longue.' });

    const updated = await updateTicketStatus(ticket.id, 'RESOLVED', agent.id);
    expect(updated.status).toBe('RESOLVED');

    const audit = await prisma.auditLog.findFirst({ where: { entityId: ticket.id, action: 'SUPPORT_TICKET_STATUS_CHANGED' } });
    expect(audit).toBeDefined();
    expect((audit?.afterState as Record<string, unknown>)?.status).toBe('RESOLVED');
  });
});

describe('listSupportAgents', () => {
  it('ne retourne que les rôles disposant de SUPPORT_MANAGE (SUPER_ADMIN, SUPPORT_AGENT)', async () => {
    await createUser('DRIVER');
    await createUser('SUPPLIER');
    const admin = await createUser('SUPER_ADMIN');
    const agent = await createUser('SUPPORT_AGENT');

    const agents = await listSupportAgents();
    const ids = agents.map((a) => a.id);
    expect(ids).toContain(admin.id);
    expect(ids).toContain(agent.id);
    expect(ids).toHaveLength(2);
  });
});
