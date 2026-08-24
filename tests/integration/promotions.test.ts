import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createPromoCode, validateAndApplyDiscount, PromoError } from '@/modules/promotions/promotions.service';

beforeEach(resetDatabase);

describe('createPromoCode', () => {
  it('normalise toujours le code en majuscules', async () => {
    const promo = await createPromoCode({ code: 'ete2026', discountType: 'PERCENTAGE', discountValue: 10 });
    expect(promo.code).toBe('ETE2026');
  });
});

describe('validateAndApplyDiscount — application du rabais', () => {
  it('applique un pourcentage plafonné (maxDiscount)', async () => {
    await createPromoCode({ code: 'PROMO10', discountType: 'PERCENTAGE', discountValue: 10, maxDiscount: 30 });

    const result = await validateAndApplyDiscount('promo10', 1000); // 10% de 1000 = 100, plafonné à 30
    expect(result.discountAmount).toBe(30);
  });

  it('un montant fixe ne dépasse jamais le sous-total', async () => {
    await createPromoCode({ code: 'FIXE100', discountType: 'FIXED_AMOUNT', discountValue: 100 });

    const result = await validateAndApplyDiscount('FIXE100', 50);
    expect(result.discountAmount).toBe(50);
  });

  it('refuse un code inconnu', async () => {
    await expect(validateAndApplyDiscount('INCONNU', 100)).rejects.toThrow(PromoError);
  });

  it('refuse un code désactivé', async () => {
    const promo = await createPromoCode({ code: 'DESACTIVE', discountType: 'FIXED_AMOUNT', discountValue: 10 });
    await prisma.promoCode.update({ where: { id: promo.id }, data: { isActive: false } });

    await expect(validateAndApplyDiscount('DESACTIVE', 100)).rejects.toThrow(PromoError);
  });

  it('refuse un code expiré', async () => {
    await createPromoCode({
      code: 'EXPIRE',
      discountType: 'FIXED_AMOUNT',
      discountValue: 10,
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    await expect(validateAndApplyDiscount('EXPIRE', 100)).rejects.toThrow(PromoError);
  });

  it('refuse si le sous-total est sous le minimum requis', async () => {
    await createPromoCode({ code: 'MIN200', discountType: 'FIXED_AMOUNT', discountValue: 10, minOrderAmount: 200 });

    await expect(validateAndApplyDiscount('MIN200', 150)).rejects.toThrow(PromoError);
    await expect(validateAndApplyDiscount('MIN200', 200)).resolves.toBeDefined();
  });

  it("incrémente usageCount à chaque utilisation réussie", async () => {
    const promo = await createPromoCode({ code: 'COMPTEUR', discountType: 'FIXED_AMOUNT', discountValue: 5 });
    await validateAndApplyDiscount('COMPTEUR', 100);
    await validateAndApplyDiscount('COMPTEUR', 100);

    const updated = await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } });
    expect(updated.usageCount).toBe(2);
  });

  it("refuse une utilisation au-delà de usageLimit", async () => {
    await createPromoCode({ code: 'UNIQUE', discountType: 'FIXED_AMOUNT', discountValue: 5, usageLimit: 1 });

    await validateAndApplyDiscount('UNIQUE', 100);
    await expect(validateAndApplyDiscount('UNIQUE', 100)).rejects.toThrow(PromoError);
  });

  it('empêche un dépassement de usageLimit sous appels concurrents (protection contre la course)', async () => {
    await createPromoCode({ code: 'COURSE', discountType: 'FIXED_AMOUNT', discountValue: 5, usageLimit: 1 });

    const results = await Promise.allSettled([
      validateAndApplyDiscount('COURSE', 100),
      validateAndApplyDiscount('COURSE', 100),
      validateAndApplyDiscount('COURSE', 100),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);

    const promo = await prisma.promoCode.findUniqueOrThrow({ where: { code: 'COURSE' } });
    expect(promo.usageCount).toBe(1);
  });
});
