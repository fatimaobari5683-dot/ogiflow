import { NextRequest, NextResponse } from 'next/server';
import { requireSupplierAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { retryWebhookDelivery, WebhookError } from '@/modules/webhooks/webhooks.service';
import { prisma } from '@/infrastructure/database/client';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const delivery = await prisma.webhookDelivery.findUnique({ where: { id: params.id }, select: { supplierId: true } });
    if (!delivery) {
      throw new WebhookError('Livraison introuvable.', 404);
    }
    await requireSupplierAccess(req, delivery.supplierId, Permission.SUPPLIERS_MANAGE);

    const result = await retryWebhookDelivery(params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return toErrorResponse(err, 'WEBHOOK_RETRY_ERROR');
  }
}
