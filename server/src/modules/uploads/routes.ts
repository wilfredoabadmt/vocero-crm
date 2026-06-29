import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../auth/guards.js';
import { config } from '../../config.js';
import { notFound } from '../../lib/errors.js';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
};

export function uploadRoutes(app: FastifyInstance) {
  app.get('/api/uploads/*', async (request, reply) => {
    const rel = (request.params as Record<string, string>)['*'] ?? '';
    
    // El subdirectorio brand/ (marca blanca) es de acceso público
    if (!rel.startsWith('brand/')) {
      await requireAuth(request, reply);
    }

    const resolved = path.resolve(config.uploadsDir, rel);
    // Protección contra path traversal
    if (!resolved.startsWith(config.uploadsDir + path.sep) && resolved !== config.uploadsDir) {
      throw notFound('Archivo no encontrado');
    }
    if (!existsSync(resolved) || !statSync(resolved).isFile()) throw notFound('Archivo no encontrado');
    const ext = path.extname(resolved).toLowerCase();
    reply.type(MIME_BY_EXT[ext] ?? 'application/octet-stream');
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(createReadStream(resolved));
  });
}
