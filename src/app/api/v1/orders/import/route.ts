import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, assertPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { importOrdersFromCsv, OrderImportError } from '@/modules/orders/orders-import.service';
import { toErrorResponse } from '@/shared/http/api-error';

const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo — largement suffisant pour un import texte de plusieurs milliers de lignes

/**
 * Import CSV en masse — un fournisseur importe uniquement pour son propre
 * compte (même garde que la création de commande unitaire, voir
 * /api/v1/orders). Pas d'idempotency-key ici, contrairement à la création
 * unitaire : un import est un fichier entier, pas une seule intention
 * d'achat rejouable à l'identique — le rapport ligne par ligne permet de
 * repérer et corriger un doublon a posteriori si le même fichier est
 * soumis deux fois.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    assertPermission(context.role, Permission.ORDERS_CREATE);

    let supplierId: string;
    if (context.role === 'SUPPLIER') {
      const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
      if (!supplier) throw new ForbiddenError('Profil fournisseur introuvable.');
      supplierId = supplier.id;
    } else {
      throw new ForbiddenError("Seul un compte fournisseur peut importer des commandes.");
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof Blob)) {
      throw new OrderImportError('Fichier CSV manquant.');
    }
    if (file.size > MAX_CSV_SIZE_BYTES) {
      throw new OrderImportError('Fichier trop volumineux (2 Mo maximum).');
    }

    const csvText = await file.text();
    const summary = await importOrdersFromCsv(supplierId, csvText);

    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_IMPORT_ERROR');
  }
}
