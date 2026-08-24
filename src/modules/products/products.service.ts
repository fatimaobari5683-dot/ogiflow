import { prisma } from '@/infrastructure/database/client';
import type { CreateProductInput, UpdateProductInput } from './products.validators';

export class ProductError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ProductError';
    this.statusCode = statusCode;
  }
}

export async function createProduct(supplierId: string, input: CreateProductInput) {
  if (input.sku) {
    const existing = await prisma.product.findUnique({
      where: { supplierId_sku: { supplierId, sku: input.sku } },
    });
    if (existing) {
      throw new ProductError(`Un produit avec le SKU "${input.sku}" existe déjà dans votre catalogue.`, 409);
    }
  }

  return prisma.product.create({
    data: {
      supplierId,
      sku: input.sku,
      name: input.name,
      description: input.description,
      price: input.price,
      weightKg: input.weightKg,
    },
  });
}

export async function listProducts(supplierId: string, filter: { isActive?: boolean } = {}) {
  return prisma.product.findMany({
    where: { supplierId, isActive: filter.isActive },
    orderBy: { createdAt: 'desc' },
  });
}

async function getOwnedProduct(productId: string, supplierId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.supplierId !== supplierId) {
    throw new ProductError("Ce produit n'appartient pas à votre catalogue.", 404);
  }
  return product;
}

export async function getProductDetail(productId: string, supplierId: string) {
  return getOwnedProduct(productId, supplierId);
}

export async function updateProduct(productId: string, supplierId: string, input: UpdateProductInput) {
  await getOwnedProduct(productId, supplierId);

  if (input.sku) {
    const existing = await prisma.product.findUnique({
      where: { supplierId_sku: { supplierId, sku: input.sku } },
    });
    if (existing && existing.id !== productId) {
      throw new ProductError(`Un produit avec le SKU "${input.sku}" existe déjà dans votre catalogue.`, 409);
    }
  }

  return prisma.product.update({ where: { id: productId }, data: input });
}
