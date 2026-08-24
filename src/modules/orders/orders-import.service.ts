import Papa from 'papaparse';
import { z } from 'zod';
import { prisma } from '@/infrastructure/database/client';
import { phoneSchema } from '@/modules/auth/auth.validators';
import { createOrderForSupplier, OrderError } from './orders.service';
import { PromoError } from '@/modules/promotions/promotions.service';

export class OrderImportError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'OrderImportError';
    this.statusCode = statusCode;
  }
}

// Une ligne CSV = une commande à un seul article — pas de regroupement de
// lignes par commande multi-articles : la version manuelle du formulaire
// (CreateOrderForm.tsx) reste le chemin pour un panier composite. Simple et
// honnête plutôt que d'inventer un format de colonnes ambigu.
const csvRowSchema = z.object({
  customerName: z.string().trim().min(2, 'Nom client trop court').max(150),
  customerPhone: phoneSchema,
  customerEmail: z
    .string()
    .trim()
    .email('Email invalide')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  address: z.string().trim().min(3, 'Adresse trop courte').max(300),
  city: z.string().trim().min(1, 'Ville requise').max(100),
  productSku: z.string().trim().min(1, 'SKU produit requis'),
  quantity: z.coerce.number().int().positive('Quantité invalide'),
  deliveryFee: z.coerce.number().nonnegative('Frais de livraison invalides'),
  promoCode: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  instructions: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const CSV_TEMPLATE_HEADER =
  'customerName,customerPhone,customerEmail,address,city,productSku,quantity,deliveryFee,promoCode,instructions';

export const CSV_TEMPLATE_EXAMPLE_ROW =
  'Fatima Zahra,+212600000099,,12 Rue des Fleurs Appt 4,Casablanca,SKU-001,2,20,,Sonner à l\'interphone';

export interface OrderImportRowResult {
  line: number; // 1 = en-tête, 2 = première ligne de données (correspond au fichier tel quel dans un tableur)
  success: boolean;
  orderNumber?: string;
  orderId?: string;
  error?: string;
}

export interface OrderImportSummary {
  successCount: number;
  failureCount: number;
  results: OrderImportRowResult[];
}

/**
 * Importe des commandes en masse depuis un CSV — réutilise exactement
 * `createOrderForSupplier` ligne par ligne (même relecture serveur des prix,
 * même vérification de conformité documentaire, aucune règle métier
 * dupliquée). Une ligne invalide ou en échec n'interrompt jamais les
 * suivantes : mieux vaut un rapport partiel que de tout perdre à cause
 * d'une seule faute de frappe au milieu d'un fichier de 200 lignes.
 */
export async function importOrdersFromCsv(supplierId: string, csvText: string): Promise<OrderImportSummary> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.data.length === 0) {
    throw new OrderImportError('Le fichier CSV ne contient aucune ligne de données.');
  }

  const skus = Array.from(new Set(parsed.data.map((row) => row.productSku?.trim()).filter(Boolean)));
  const products = await prisma.product.findMany({
    where: { supplierId, sku: { in: skus as string[] }, isActive: true },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const results: OrderImportRowResult[] = [];

  for (const [index, rawRow] of parsed.data.entries()) {
    const line = index + 2; // +1 pour l'en-tête, +1 car index 0-based

    const validation = csvRowSchema.safeParse(rawRow);
    if (!validation.success) {
      const message = validation.error.issues.map((issue) => issue.message).join(' · ');
      results.push({ line, success: false, error: message });
      continue;
    }
    const row = validation.data;

    const product = productBySku.get(row.productSku);
    if (!product) {
      results.push({ line, success: false, error: `Produit introuvable pour le SKU "${row.productSku}".` });
      continue;
    }

    try {
      const order = await createOrderForSupplier({
        supplierId,
        customer: { fullName: row.customerName, phone: row.customerPhone, email: row.customerEmail },
        address: { fullAddress: row.address, city: row.city },
        items: [{ productId: product.id, quantity: row.quantity }],
        deliveryFee: row.deliveryFee,
        promoCode: row.promoCode,
        instructions: row.instructions,
      });
      results.push({ line, success: true, orderNumber: order.orderNumber, orderId: order.id });
    } catch (err) {
      const message = err instanceof OrderError || err instanceof PromoError ? err.message : 'Erreur inattendue.';
      results.push({ line, success: false, error: message });
    }
  }

  return {
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    results,
  };
}
