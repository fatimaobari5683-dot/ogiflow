import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import {
  recordAttemptMetadataSchema,
  ALLOWED_PROOF_MIME_TYPES,
  MAX_PROOF_FILE_SIZE_BYTES,
} from '@/modules/deliveries/deliveries.validators';
import { recordDeliveryAttempt, DeliveryError } from '@/modules/deliveries/deliveries.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Enregistre une tentative de livraison — succès (avec preuve de livraison
 * obligatoire) ou échec. Le point d'entrée central du module POD.
 *
 * Toujours `multipart/form-data`, même pour un échec sans fichier joint :
 * SIGNATURE/PHOTO ont besoin d'un fichier binaire dans la même requête,
 * et un seul format de requête pour cette route évite de brancher le parsing
 * sur le Content-Type reçu.
 */
export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const formData = await req.formData();

    const input = recordAttemptMetadataSchema.parse({
      result: formData.get('result') || undefined,
      notes: formData.get('notes') || undefined,
      proofType: formData.get('proofType') || undefined,
      proofValue: formData.get('proofValue') || undefined,
      latitude: formData.get('latitude') || undefined,
      longitude: formData.get('longitude') || undefined,
    });

    let file: { buffer: Buffer; mimeType: string } | undefined;
    if (input.proofType === 'SIGNATURE' || input.proofType === 'PHOTO') {
      const blob = formData.get('file');
      if (!(blob instanceof Blob)) {
        throw new DeliveryError('Fichier de preuve manquant.', 422);
      }
      if (blob.size > MAX_PROOF_FILE_SIZE_BYTES) {
        throw new DeliveryError('Fichier trop volumineux (5 Mo maximum).', 422);
      }
      if (!ALLOWED_PROOF_MIME_TYPES.includes(blob.type)) {
        throw new DeliveryError('Format de fichier non autorisé (JPEG, PNG ou WebP uniquement).', 422);
      }
      file = { buffer: Buffer.from(await blob.arrayBuffer()), mimeType: blob.type };
    }

    const order = await recordDeliveryAttempt(params.orderId, {
      result: input.result,
      notes: input.notes,
      latitude: input.latitude,
      longitude: input.longitude,
      proof: input.proofType ? { type: input.proofType, value: input.proofValue, file } : undefined,
      actorId: context.userId,
      actorRole: context.role,
    });

    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_ATTEMPT_ERROR');
  }
}
