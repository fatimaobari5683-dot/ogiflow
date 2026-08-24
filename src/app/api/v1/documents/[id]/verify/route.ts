import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { verifyDocument } from '@/modules/documents/documents.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const document = await prisma.document.findUniqueOrThrow({ where: { id: params.id } });
    const managePermission = document.ownerType === 'DRIVER' ? Permission.DRIVERS_MANAGE : Permission.SUPPLIERS_MANAGE;
    const context = await requirePermission(req, managePermission);

    const updated = await verifyDocument(params.id, context.userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return toErrorResponse(err, 'DOCUMENT_VERIFY_ERROR');
  }
}
