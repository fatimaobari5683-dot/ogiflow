import { prisma } from '@/infrastructure/database/client';
import type { PromoDiscountType } from '@prisma/client';

export class PromoError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PromoError';
    this.statusCode = statusCode;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface CreatePromoCodeInput {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  expiresAt?: Date;
  usageLimit?: number;
}

/**
 * Codes toujours normalisés en majuscules — évite qu'"ETE2026" et "ete2026"
 * soient traités comme deux codes différents à la création comme à l'usage.
 */
export async function createPromoCode(input: CreatePromoCodeInput) {
  return prisma.promoCode.create({
    data: {
      code: input.code.toUpperCase(),
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscount: input.maxDiscount,
      minOrderAmount: input.minOrderAmount,
      expiresAt: input.expiresAt,
      usageLimit: input.usageLimit,
    },
  });
}

export async function listPromoCodes() {
  return prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function setPromoCodeActive(id: string, isActive: boolean) {
  return prisma.promoCode.update({ where: { id }, data: { isActive } });
}

function computeDiscount(promo: { discountType: PromoDiscountType; discountValue: unknown; maxDiscount: unknown }, subtotal: number): number {
  if (promo.discountType === 'PERCENTAGE') {
    let discount = round2(subtotal * (Number(promo.discountValue) / 100));
    if (promo.maxDiscount !== null) discount = Math.min(discount, Number(promo.maxDiscount));
    return discount;
  }
  // FIXED_AMOUNT — ne jamais dépasser le sous-total (pas de commande à montant négatif).
  return Math.min(Number(promo.discountValue), subtotal);
}

/**
 * Valide ET consomme un usage du code en une seule opération atomique
 * (`updateMany` conditionné sur `usageCount < usageLimit`) — évite qu'un
 * code à usage limité soit dépensé plus de fois que prévu par deux
 * commandes créées au même instant. Appelée depuis `createOrder`
 * (orders.service.ts) juste avant la création réelle de la commande ;
 * en cas d'échec de la commande APRÈS cet appel, l'usage reste compté
 * (compromis accepté — même niveau de rigueur que le reste du système
 * en V1, pas de saga transactionnelle complète).
 */
export async function validateAndApplyDiscount(code: string, subtotal: number): Promise<{ promoCodeId: string; discountAmount: number }> {
  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!promo) {
    throw new PromoError('Code promo invalide.', 404);
  }
  if (!promo.isActive) {
    throw new PromoError('Ce code promo n\'est plus actif.', 409);
  }
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    throw new PromoError('Ce code promo a expiré.', 409);
  }
  if (promo.minOrderAmount !== null && subtotal < Number(promo.minOrderAmount)) {
    throw new PromoError(`Ce code promo nécessite un montant minimum de ${Number(promo.minOrderAmount)} MAD.`, 409);
  }

  if (promo.usageLimit !== null) {
    const result = await prisma.promoCode.updateMany({
      where: { id: promo.id, usageCount: { lt: promo.usageLimit } },
      data: { usageCount: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new PromoError("Ce code promo a atteint sa limite d'utilisation.", 409);
    }
  } else {
    await prisma.promoCode.update({ where: { id: promo.id }, data: { usageCount: { increment: 1 } } });
  }

  return { promoCodeId: promo.id, discountAmount: computeDiscount(promo, subtotal) };
}
