import crypto from 'crypto';
import { prisma } from '@/infrastructure/database/client';

export class WebhookError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'WebhookError';
    this.statusCode = statusCode;
  }
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 3000];
const DELIVERY_TIMEOUT_MS = 5000;

// Bloque les hôtes privés/locaux en production (protection SSRF minimale,
// pas exhaustive : pas de résolution DNS pour détecter un rebinding vers une
// IP privée). Autorisé en dev/test — nécessaire pour vérifier la livraison
// contre un serveur de test local, honnête sur cette limite comme les autres
// garde-fous "V1" du projet (LocalDiskDocumentStorage, LoggingNotificationProvider).
const PRIVATE_HOST_PATTERN = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1$)/i;

function assertUsableWebhookUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebhookError('URL de webhook invalide.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebhookError('URL de webhook invalide : http(s) uniquement.');
  }
  if (process.env.NODE_ENV === 'production') {
    if (parsed.protocol !== 'https:') {
      throw new WebhookError("En production, l'URL de webhook doit être en HTTPS.");
    }
    if (PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
      throw new WebhookError('URL de webhook invalide : hôte privé/local non autorisé.');
    }
  }
  return parsed;
}

/**
 * Configure (ou supprime, avec `url: null`) le webhook d'un fournisseur. Le
 * secret de signature n'est généré qu'une fois — une reconfiguration de
 * l'URL ne le régénère jamais, pour ne pas casser une intégration déjà
 * branchée côté fournisseur sans le prévenir explicitement.
 */
export async function setSupplierWebhook(supplierId: string, url: string | null) {
  if (url === null) {
    return prisma.supplier.update({ where: { id: supplierId }, data: { webhookUrl: null } });
  }

  assertUsableWebhookUrl(url);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  return prisma.supplier.update({
    where: { id: supplierId },
    data: { webhookUrl: url, webhookSecret: supplier.webhookSecret ?? crypto.randomBytes(24).toString('hex') },
  });
}

function sign(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function attemptDelivery(url: string, rawBody: string, secret: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LogiFlow-Signature': `sha256=${sign(secret, rawBody)}` },
      body: rawBody,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau.' };
  }
}

async function deliverAndRecord(
  supplierId: string,
  url: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>
) {
  const rawBody = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });

  let attempts = 0;
  let result: { ok: boolean; status?: number; error?: string } = { ok: false };
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    attempts += 1;
    result = await attemptDelivery(url, rawBody, secret);
    if (result.ok) break;
    if (i < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[i]));
    }
  }

  return prisma.webhookDelivery.create({
    data: {
      supplierId,
      event,
      orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
      url,
      payload: JSON.parse(rawBody),
      status: result.ok ? 'SUCCESS' : 'FAILED',
      attempts,
      responseStatus: result.status,
      errorMessage: result.error,
    },
  });
}

/**
 * Point d'entrée appelé par les handlers d'événements domaine
 * (webhooks.events.ts). No-op silencieux si le fournisseur n'a pas configuré
 * de webhook — la quasi-totalité des commandes, donc pas de bruit dans les
 * logs pour le cas normal.
 */
export async function sendWebhook(supplierId: string, event: string, payload: Record<string, unknown>) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { webhookUrl: true, webhookSecret: true },
  });
  if (!supplier?.webhookUrl || !supplier.webhookSecret) return null;

  return deliverAndRecord(supplierId, supplier.webhookUrl, supplier.webhookSecret, event, payload);
}

/**
 * Rejoue manuellement une livraison (échouée ou non) — le seul mécanisme de
 * reprise au-delà des tentatives immédiates de `sendWebhook`, en l'absence
 * de file de réessai différé dans ce projet.
 */
export async function retryWebhookDelivery(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    throw new WebhookError('Livraison introuvable.', 404);
  }

  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: delivery.supplierId } });
  if (!supplier.webhookUrl || !supplier.webhookSecret) {
    throw new WebhookError('Aucun webhook configuré pour ce fournisseur.', 409);
  }

  return deliverAndRecord(
    delivery.supplierId,
    supplier.webhookUrl,
    supplier.webhookSecret,
    delivery.event,
    delivery.payload as Record<string, unknown>
  );
}

export async function listWebhookDeliveries(supplierId: string, limit = 30) {
  return prisma.webhookDelivery.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' }, take: limit });
}
