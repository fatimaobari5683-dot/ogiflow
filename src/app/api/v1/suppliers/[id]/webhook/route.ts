import { NextRequest, NextResponse } from 'next/server';
import { requireSupplierAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { setWebhookSchema } from '@/modules/webhooks/webhooks.validators';
import { setSupplierWebhook, listWebhookDeliveries } from '@/modules/webhooks/webhooks.service';
import { prisma } from '@/infrastructure/database/client';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSupplierAccess(req, params.id, Permission.SUPPLIERS_MANAGE);
    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: params.id },
      select: { webhookUrl: true, webhookSecret: true },
    });
    const deliveries = await listWebhookDeliveries(params.id);
    return NextResponse.json({ success: true, data: { ...supplier, deliveries } });
  } catch (err) {
    return toErrorResponse(err, 'WEBHOOK_GET_ERROR');
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSupplierAccess(req, params.id, Permission.SUPPLIERS_MANAGE);
    const body = await req.json();
    const { url } = setWebhookSchema.parse(body);

    const supplier = await setSupplierWebhook(params.id, url);
    return NextResponse.json({ success: true, data: { webhookUrl: supplier.webhookUrl, webhookSecret: supplier.webhookSecret } });
  } catch (err) {
    return toErrorResponse(err, 'WEBHOOK_SET_ERROR');
  }
}
