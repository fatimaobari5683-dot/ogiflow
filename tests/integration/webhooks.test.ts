import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import crypto from 'node:crypto';
import { prisma, resetDatabase } from '../db';
import { createSupplier } from '../factories';
import { registerAllEventHandlers } from '../register-events';
import { dispatchDomainEvent } from '@/infrastructure/messaging/event-bus';
import {
  setSupplierWebhook,
  sendWebhook,
  retryWebhookDelivery,
  listWebhookDeliveries,
  WebhookError,
} from '@/modules/webhooks/webhooks.service';

beforeAll(registerAllEventHandlers);
beforeEach(resetDatabase);

/**
 * Petit serveur HTTP local réel (pas un mock de `fetch`) : on veut prouver
 * que la requête part vraiment sur le réseau, avec la bonne signature —
 * exactement ce qu'un fournisseur qui construit son propre récepteur devra
 * vérifier de son côté.
 */
function startTestServer(handler: (req: IncomingMessage, body: string) => { status: number }) {
  let received: { headers: Record<string, string | string[] | undefined>; body: string } | null = null;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      received = { headers: req.headers, body };
      const { status } = handler(req, body);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: status < 300 }));
    });
  });
  return {
    server,
    getReceived: () => received,
    start: () =>
      new Promise<string>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 0;
          resolve(`http://127.0.0.1:${port}/webhook`);
        });
      }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('setSupplierWebhook', () => {
  it("génère un secret à la première configuration, ne le régénère jamais ensuite", async () => {
    const { supplier } = await createSupplier();

    const first = await setSupplierWebhook(supplier.id, 'https://example.test/hook-a');
    expect(first.webhookUrl).toBe('https://example.test/hook-a');
    expect(first.webhookSecret).toBeTruthy();

    const second = await setSupplierWebhook(supplier.id, 'https://example.test/hook-b');
    expect(second.webhookUrl).toBe('https://example.test/hook-b');
    expect(second.webhookSecret).toBe(first.webhookSecret);
  });

  it('désactive le webhook avec url: null, sans effacer le secret existant', async () => {
    const { supplier } = await createSupplier();
    const configured = await setSupplierWebhook(supplier.id, 'https://example.test/hook');

    const disabled = await setSupplierWebhook(supplier.id, null);
    expect(disabled.webhookUrl).toBeNull();
    expect(disabled.webhookSecret).toBe(configured.webhookSecret);
  });

  it('rejette une URL invalide', async () => {
    const { supplier } = await createSupplier();
    await expect(setSupplierWebhook(supplier.id, 'pas-une-url')).rejects.toThrow(WebhookError);
  });
});

describe('sendWebhook', () => {
  it("ne fait rien (pas d'appel réseau, pas de ligne créée) si aucun webhook n'est configuré", async () => {
    const { supplier } = await createSupplier();
    const result = await sendWebhook(supplier.id, 'ORDER_CONFIRMED', { orderId: 'x' });
    expect(result).toBeNull();
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it('livre réellement la requête HTTP, signée, et journalise un succès', async () => {
    const testServer = startTestServer(() => ({ status: 200 }));
    const url = await testServer.start();
    try {
      const { supplier } = await createSupplier();
      const configured = await setSupplierWebhook(supplier.id, url);

      const delivery = await sendWebhook(supplier.id, 'ORDER_CONFIRMED', { orderId: 'order-123', orderNumber: 'ORD-2026-000001' });

      expect(delivery?.status).toBe('SUCCESS');
      expect(delivery?.attempts).toBe(1);
      expect(delivery?.responseStatus).toBe(200);

      const received = testServer.getReceived();
      expect(received).not.toBeNull();
      const payload = JSON.parse(received!.body);
      expect(payload).toMatchObject({ event: 'ORDER_CONFIRMED', orderId: 'order-123', orderNumber: 'ORD-2026-000001' });

      const signatureHeader = received!.headers['x-logiflow-signature'] as string;
      expect(signatureHeader).toMatch(/^sha256=/);
      const expectedSignature = `sha256=${crypto.createHmac('sha256', configured.webhookSecret!).update(received!.body).digest('hex')}`;
      expect(signatureHeader).toBe(expectedSignature);
    } finally {
      await testServer.stop();
    }
  });

  it('réessaie plusieurs fois puis journalise un échec si le récepteur renvoie une erreur', async () => {
    const testServer = startTestServer(() => ({ status: 500 }));
    const url = await testServer.start();
    try {
      const { supplier } = await createSupplier();
      await setSupplierWebhook(supplier.id, url);

      const delivery = await sendWebhook(supplier.id, 'ORDER_CANCELLED', { orderId: 'order-456' });

      expect(delivery?.status).toBe('FAILED');
      expect(delivery?.attempts).toBe(3);
      expect(delivery?.responseStatus).toBe(500);
    } finally {
      await testServer.stop();
    }
  }, 15000);
});

describe('retryWebhookDelivery', () => {
  it('rejoue une livraison et en crée une nouvelle plutôt que de modifier l\'ancienne', async () => {
    const testServer = startTestServer(() => ({ status: 200 }));
    const url = await testServer.start();
    try {
      const { supplier } = await createSupplier();
      await setSupplierWebhook(supplier.id, url);
      const original = await sendWebhook(supplier.id, 'ORDER_DELIVERED', { orderId: 'order-789' });

      const replay = await retryWebhookDelivery(original!.id);

      expect(replay.id).not.toBe(original!.id);
      expect(replay.status).toBe('SUCCESS');

      const all = await listWebhookDeliveries(supplier.id);
      expect(all).toHaveLength(2);
    } finally {
      await testServer.stop();
    }
  });

  it('lève une erreur explicite pour une livraison inconnue', async () => {
    await expect(retryWebhookDelivery('inconnue')).rejects.toThrow(WebhookError);
  });
});

describe("intégration avec la state machine — l'événement domaine déclenche réellement l'envoi", () => {
  it('ORDER_CANCELLED (dispatché via dispatchDomainEvent) livre le webhook configuré', async () => {
    const testServer = startTestServer(() => ({ status: 200 }));
    const url = await testServer.start();
    try {
      const { supplier } = await createSupplier();
      await setSupplierWebhook(supplier.id, url);

      const fakeOrder = { id: 'order-evt', orderNumber: 'ORD-2026-000099', supplierId: supplier.id, status: 'CANCELLED' };
      await dispatchDomainEvent('ORDER_CANCELLED', { orderId: fakeOrder.id, order: fakeOrder });

      // dispatchDomainEvent attend Promise.allSettled de tous les handlers,
      // dont sendWebhook (qui inclut ses propres délais de réessai en cas
      // d'échec) — ici succès du premier coup, donc pas d'attente supplémentaire.
      const deliveries = await listWebhookDeliveries(supplier.id);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]!.event).toBe('ORDER_CANCELLED');
      expect(deliveries[0]!.orderId).toBe('order-evt');
    } finally {
      await testServer.stop();
    }
  });
});
