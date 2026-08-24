import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { rejectDocumentSchema } from '@/modules/documents/documents.validators';
import { rejectDocument } from '@/modules/documents/documents.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const document = await prisma.document.findUniqueOrThrow({ where: { id: params.id } });
    const managePermission = document.ownerType === 'DRIVER' ? Permission.DRIVERS_MANAGE : Permission.SUPPLIERS_MANAGE;
    const context = await requirePermission(req, managePermission);
    const { reasonCode, reason } = rejectDocumentSchema.parse(await req.json());

    const updated = await rejectDocument(params.id, context.userId, reasonCode, reason);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return toErrorResponse(err, 'DOCUMENT_REJECT_ERROR');
  }
}
