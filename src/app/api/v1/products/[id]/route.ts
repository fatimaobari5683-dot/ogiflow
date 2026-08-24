import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, hasPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { updateProductSchema } from '@/modules/products/products.validators';
import { getProductDetail, updateProduct } from '@/modules/products/products.service';
import { toErrorResponse } from '@/shared/http/api-error';

async function resolveSupplierId(context: { userId: string; role: string }): Promise<string> {
  const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
  if (!supplier) throw new ForbiddenError('Profil fournisseur introuvable.');
  return supplier.id;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthContext(req);
    if (!hasPermission(context.role, Permission.PRODUCTS_MANAGE_OWN)) {
      throw new ForbiddenError("Ce rôle n'a pas accès à ce produit.");
    }
    const supplierId = await resolveSupplierId(context);
    const product = await getProductDetail(params.id, supplierId);
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    return toErrorResponse(err, 'PRODUCT_DETAIL_ERROR');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthContext(req);
    if (!hasPermission(context.role, Permission.PRODUCTS_MANAGE_OWN)) {
      throw new ForbiddenError("Ce rôle ne peut pas modifier ce produit.");
    }
    const body = await req.json();
    const input = updateProductSchema.parse(body);
    const supplierId = await resolveSupplierId(context);

    const product = await updateProduct(params.id, supplierId, input);
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    return toErrorResponse(err, 'PRODUCT_UPDATE_ERROR');
  }
}
