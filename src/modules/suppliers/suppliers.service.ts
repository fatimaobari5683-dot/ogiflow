import { prisma } from '@/infrastructure/database/client';
import { getSupplierAnalytics } from '@/modules/analytics/analytics.service';
import type { SupplierStatus } from '@prisma/client';

export async function listSuppliers(filter: { status?: SupplierStatus } = {}) {
  return prisma.supplier.findMany({
    where: { status: filter.status },
    include: {
      user: { select: { firstName: true, lastName: true, phone: true, email: true } },
      _count: { select: { orders: true, products: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSupplierProfile(supplierId: string) {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: supplierId },
    include: {
      user: { select: { firstName: true, lastName: true, phone: true, email: true } },
      _count: { select: { orders: true, products: true } },
    },
  });
  const analytics = await getSupplierAnalytics(supplierId);
  return { ...supplier, analytics };
}
