import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

interface HttpError extends Error {
  statusCode?: number;
}

/**
 * Traduction uniforme des erreurs de service (AuthError, ForbiddenError,
 * DriverError, DispatchError, ...) en réponses HTTP — toutes exposent déjà
 * un `statusCode` explicite, donc aucun mapping par type n'est nécessaire.
 */
export function toErrorResponse(err: unknown, logTag: string): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', details: err.flatten() },
      { status: 422 }
    );
  }

  const httpError = err as HttpError;
  if (typeof httpError?.statusCode === 'number') {
    return NextResponse.json({ success: false, error: httpError.message }, { status: httpError.statusCode });
  }

  console.error(`[${logTag}]`, err);
  return NextResponse.json({ success: false, error: 'Erreur interne du serveur.' }, { status: 500 });
}
