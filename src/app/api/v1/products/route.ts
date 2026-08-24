import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, hasPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { createProductSchema } from '@/modules/products/products.validators';
import { createProduct, listProducts } from '@/modules/products/products.service';
import { toErrorResponse } from '@/shared/http/api-error';

async function resolveSupplierId(context: { userId: string; role: string }, querySupplierId?: string): Promise<string> {
  if (context.role === 'SUPPLIER') {
    const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
    if (!supplier) throw new ForbiddenError('Profil fournisseur introuvable.');
    return supplier.id;
  }
  if (!querySupplierId) {
    throw new ForbiddenError('Paramètre supplierId requis pour ce rôle.');
  }
  return querySupplierId;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!hasPermission(context.role, Permission.PRODUCTS_MANAGE_OWN) && !hasPermission(context.role, Permission.SUPPLIERS_MANAGE)) {
      throw new ForbiddenError("Ce rôle n'a pas accès au catalogue produits.");
    }

    const { searchParams } = new URL(req.url);
    const supplierId = await resolveSupplierId(context, searchParams.get('supplierId') ?? undefined);
    const isActiveParam = searchParams.get('isActive');

    const products = await listProducts(supplierId, {
      isActive: isActiveParam === null ? undefined : isActiveParam === 'true',
    });
    return NextResponse.json({ success: true, data: products });
  } catch (err) {
    return toErrorResponse(err, 'PRODUCTS_LIST_ERROR');
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!hasPermission(context.role, Permission.PRODUCTS_MANAGE_OWN)) {
      throw new ForbiddenError("Ce rôle ne peut pas créer de produit.");
    }

    const body = await req.json();
    const input = createProductSchema.parse(body);
    const supplierId = await resolveSupplierId(context);

    const product = await createProduct(supplierId, input);
    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'PRODUCT_CREATE_ERROR');
  }
}
