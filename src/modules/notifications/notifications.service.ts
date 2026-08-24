import { Prisma } from '@prisma/client';
import type { NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from '@/infrastructure/database/client';

export interface NotificationRecipient {
  userId?: string;
  phone?: string;
  email?: string;
}

interface QueueNotificationInput {
  recipient: NotificationRecipient;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Abstraction du canal d'envoi. En V1, seul un provider de secours (log
 * structuré) est branché — honnête sur le fait qu'aucun fournisseur SMS/
 * WhatsApp/Email réel n'est encore intégré. Chaque canal réel (Twilio,
 * WhatsApp Business API, Resend/SES) s'implémente derrière cette même
 * interface, sans toucher aux handlers d'événements qui l'utilisent.
 */
export interface NotificationProvider {
  send(recipient: NotificationRecipient, event: string, payload: Record<string, unknown>): Promise<boolean>;
}

class LoggingNotificationProvider implements NotificationProvider {
  constructor(private channel: NotificationChannel) {}

  async send(recipient: NotificationRecipient, event: string, payload: Record<string, unknown>): Promise<boolean> {
    console.info(`[NOTIFICATION:${this.channel}] event=${event} recipient=${JSON.stringify(recipient)}`, payload);
    return true;
  }
}

const providers: Record<NotificationChannel, NotificationProvider> = {
  SMS: new LoggingNotificationProvider('SMS'),
  WHATSAPP: new LoggingNotificationProvider('WHATSAPP'),
  EMAIL: new LoggingNotificationProvider('EMAIL'),
  PUSH: new LoggingNotificationProvider('PUSH'),
};

/**
 * Permet de brancher un provider réel (ex: Twilio en production) sans
 * modifier les appelants ni les handlers d'événements.
 */
export function registerNotificationProvider(channel: NotificationChannel, provider: NotificationProvider) {
  providers[channel] = provider;
}

export async function queueAndSendNotification(input: QueueNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.recipient.userId,
      channel: input.channel,
      event: input.event,
      payload: input.payload as Prisma.InputJsonValue,
      status: 'QUEUED',
    },
  });

  const provider = providers[input.channel];
  const success = await provider.send(input.recipient, input.event, input.payload).catch(() => false);

  return prisma.notification.update({
    where: { id: notification.id },
    data: success ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED' },
  });
}

export async function listNotifications(filter: { userId?: string; status?: NotificationStatus } = {}) {
  return prisma.notification.findMany({
    where: { userId: filter.userId, status: filter.status },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
