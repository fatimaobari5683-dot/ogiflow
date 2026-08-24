import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { listWebhookDeliveries } from '@/modules/webhooks/webhooks.service';
import { WebhookSettingsForm } from '@/components/supplier/WebhookSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SupplierWebhooksPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { userId: user.id },
    select: { id: true, webhookUrl: true, webhookSecret: true },
  });
  const deliveries = await listWebhookDeliveries(supplier.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Webhooks</h1>
        <p className="text-sm text-ink-secondary">
          Recevez une notification HTTP sur votre propre système à chaque changement de statut d&apos;une de vos
          commandes (confirmée, assignée, en livraison, livrée, retournée, annulée).
        </p>
      </div>

      <WebhookSettingsForm
        supplierId={supplier.id}
        initialUrl={supplier.webhookUrl}
        initialSecret={supplier.webhookSecret}
        initialDeliveries={deliveries.map((d) => ({
          id: d.id,
          event: d.event,
          status: d.status,
          attempts: d.attempts,
          responseStatus: d.responseStatus,
          errorMessage: d.errorMessage,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
