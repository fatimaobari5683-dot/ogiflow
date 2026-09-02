import { promises as fs } from 'fs';
import path from 'path';

/**
 * Abstraction du stockage de fichiers — même principe que
 * NotificationProvider (notifications.service.ts) : un provider réel
 * (S3-compatible) s'implémente derrière cette interface sans toucher aux
 * appelants. Le provider actif est un stockage disque local, honnête sur ses
 * limites (voir LocalDiskDocumentStorage ci-dessous).
 */
export interface DocumentStorage {
  save(key: string, buffer: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Stockage disque local — fonctionnel pour développement/démonstration,
 * PAS pour production : pas de réplication, pas de chiffrement au repos, et
 * incompatible avec un déploiement multi-instance (chaque instance aurait
 * son propre disque). Les documents contiennent des données personnelles au
 * sens CNDP (CIN, permis, plaque) — avant un vrai lancement, remplacer par
 * un provider S3-compatible implémentant la même interface.
 *
 * Stocké hors de `public/` volontairement : un fichier ici n'est JAMAIS
 * servi directement par Next.js, uniquement via une route API authentifiée
 * qui vérifie la permission avant de streamer le contenu (voir
 * api/v1/documents/[id]/file/route.ts).
 */
class LocalDiskDocumentStorage implements DocumentStorage {
  private readonly rootDir = path.join(process.cwd(), 'storage', 'documents');

  private resolvePath(key: string): string {
    const resolved = path.join(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error('Clé de stockage invalide.');
    }
    return resolved;
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolvePath(key)).catch(() => {});
  }
}

let activeStorage: DocumentStorage = new LocalDiskDocumentStorage();

/** Permet de brancher un provider réel (S3, etc.) sans modifier les appelants. */
export function setDocumentStorage(storage: DocumentStorage): void {
  activeStorage = storage;
}

export function getDocumentStorage(): DocumentStorage {
  return activeStorage;
}
