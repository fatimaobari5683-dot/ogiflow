import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';
import { requireDriverAccess, requireSupplierAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getDocumentFile } from '@/modules/documents/documents.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Ne sert JAMAIS depuis /public — permission vérifiée avant toute lecture du
 * fichier (CIN, permis, carte grise sont des données personnelles au sens
 * CNDP). `Cache-Control: private, no-store` : jamais mis en cache par un
 * intermédiaire partagé.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const document = await prisma.document.findUniqueOrThrow({ where: { id: params.id } });

    if (document.ownerType === 'DRIVER') {
      await requireDriverAccess(req, document.ownerId, Permission.DRIVERS_MANAGE);
    } else {
      await requireSupplierAccess(req, document.ownerId, Permission.SUPPLIERS_MANAGE);
    }

    const { buffer } = await getDocumentFile(params.id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err, 'DOCUMENT_FILE_ERROR');
  }
}
