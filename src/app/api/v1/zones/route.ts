import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';

/**
 * Liste publique des zones actives — utilisée par le formulaire d'inscription
 * livreur (choix de la zone principale) avant même la création du compte,
 * donc volontairement sans authentification. Ne renvoie que l'identité de la
 * zone, jamais de données opérationnelles (polygon, tarifs).
 */
export async function GET() {
  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ success: true, data: zones });
}
