import { NextResponse } from 'next/server';

/**
 * Liveness — le processus répond, indépendamment de ses dépendances.
 * Distinct de /api/ready (voir ce fichier) : un orchestrateur redémarre le
 * processus sur un échec de /health, mais retire seulement l'instance du
 * load balancer sur un échec de /ready.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
