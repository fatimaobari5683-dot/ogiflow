import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from '@/lib/api-client';

/**
 * Régression : `apiFetch` jetait littéralement la chaîne "VALIDATION_ERROR"
 * comme message d'erreur, en ignorant `details` (le `.flatten()` Zod que
 * chaque route renvoie déjà — voir api-error.ts). L'utilisateur voyait le
 * code d'erreur brut au lieu de savoir quel champ corriger.
 */
describe('apiFetch — extraction du message d\'erreur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchOnce(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: status < 400,
        status,
        json: async () => body,
      })
    );
  }

  it('reconstruit un message lisible à partir de details.fieldErrors (jamais le code brut)', async () => {
    mockFetchOnce(422, {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        formErrors: [],
        fieldErrors: {
          password: ['Le mot de passe doit contenir au moins une majuscule', 'Le mot de passe doit contenir au moins un caractère spécial'],
        },
      },
    });

    await expect(apiFetch('/api/v1/auth/register', { method: 'POST' })).rejects.toMatchObject({
      message: 'Le mot de passe doit contenir au moins une majuscule · Le mot de passe doit contenir au moins un caractère spécial',
      status: 422,
    });
  });

  it('inclut formErrors quand fieldErrors est vide', async () => {
    mockFetchOnce(422, {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { formErrors: ['Requête invalide'], fieldErrors: {} },
    });

    await expect(apiFetch('/api/v1/orders', { method: 'POST' })).rejects.toMatchObject({ message: 'Requête invalide' });
  });

  it("retombe sur le code d'erreur pour une erreur métier normale (pas une ZodError)", async () => {
    mockFetchOnce(409, { success: false, error: 'Un compte existe déjà avec ce téléphone ou cet email.' });

    await expect(apiFetch('/api/v1/auth/register', { method: 'POST' })).rejects.toMatchObject({
      message: 'Un compte existe déjà avec ce téléphone ou cet email.',
      status: 409,
    });
  });

  it('retombe sur un message HTTP générique si le corps est illisible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      })
    );

    await expect(apiFetch('/api/v1/orders')).rejects.toMatchObject({ message: 'Erreur HTTP 500' });
  });

  it('retourne data directement en cas de succès', async () => {
    mockFetchOnce(200, { success: true, data: { id: 'abc' } });
    await expect(apiFetch('/api/v1/orders')).resolves.toEqual({ id: 'abc' });
  });
});

describe('ApiError', () => {
  it('porte le statut HTTP', () => {
    const err = new ApiError('boom', 403);
    expect(err.status).toBe(403);
    expect(err.name).toBe('ApiError');
  });
});
