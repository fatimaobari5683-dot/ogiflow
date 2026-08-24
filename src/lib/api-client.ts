/**
 * Client fetch minimal pour les Client Components : les cookies httpOnly de
 * session voyagent automatiquement (same-origin), donc aucun token à gérer
 * ici. Lève une erreur avec le message serveur en cas d'échec.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ErrorResponseBody {
  error?: string;
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
}

/**
 * Toutes les routes renvoient `{ error: 'VALIDATION_ERROR', details: zodError.flatten() }`
 * sur une erreur Zod (voir api-error.ts) — le code `error` seul n'est donc
 * jamais un message affichable pour ce cas précis. Sans cette extraction,
 * l'utilisateur voit littéralement le texte "VALIDATION_ERROR" au lieu de
 * savoir quel champ corriger.
 */
function extractErrorMessage(body: ErrorResponseBody | null, status: number): string {
  if (body?.error === 'VALIDATION_ERROR' && body.details) {
    const messages = [...(body.details.formErrors ?? []), ...Object.values(body.details.fieldErrors ?? {}).flat()];
    if (messages.length > 0) return messages.join(' · ');
  }
  return body?.error ?? `Erreur HTTP ${status}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    throw new ApiError(extractErrorMessage(body, res.status), res.status);
  }

  return body.data as T;
}
