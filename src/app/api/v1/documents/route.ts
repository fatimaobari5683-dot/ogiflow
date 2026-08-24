import { NextRequest, NextResponse } from 'next/server';
import { requireDriverAccess, requireSupplierAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { uploadDocumentMetadataSchema, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@/modules/documents/documents.validators';
import { uploadDocument, DocumentError } from '@/modules/documents/documents.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const metadata = uploadDocumentMetadataSchema.parse({
      ownerType: formData.get('ownerType'),
      ownerId: formData.get('ownerId'),
      type: formData.get('type'),
      documentNumber: formData.get('documentNumber') || undefined,
      issuedAt: formData.get('issuedAt') || undefined,
      expiresAt: formData.get('expiresAt') || undefined,
    });

    // Libre-service pour le propriétaire (livreur/fournisseur sur son propre
    // dossier), ou un manager agissant pour lui — même garde que le reste
    // des ressources scoping "propriétaire" (voir auth-context.ts).
    if (metadata.ownerType === 'DRIVER') {
      await requireDriverAccess(req, metadata.ownerId, Permission.DRIVERS_MANAGE);
    } else {
      await requireSupplierAccess(req, metadata.ownerId, Permission.SUPPLIERS_MANAGE);
    }

    const file = formData.get('file');
    if (!(file instanceof Blob)) {
      throw new DocumentError('Fichier manquant.', 422);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new DocumentError('Fichier trop volumineux (8 Mo maximum).', 422);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new DocumentError('Format de fichier non autorisé (JPEG, PNG ou PDF uniquement).', 422);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file instanceof File ? file.name : `document-${Date.now()}`;

    const document = await uploadDocument({
      ownerType: metadata.ownerType,
      ownerId: metadata.ownerId,
      type: metadata.type,
      documentNumber: metadata.documentNumber,
      issuedAt: metadata.issuedAt,
      expiresAt: metadata.expiresAt,
      file: { buffer, fileName, mimeType: file.type },
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'DOCUMENT_UPLOAD_ERROR');
  }
}
