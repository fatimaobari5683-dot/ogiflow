import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/client';

/** Readiness — vérifie que les dépendances critiques (base de données) répondent. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ready' });
  } catch {
    return NextResponse.json({ status: 'not_ready' }, { status: 503 });
  }
}
