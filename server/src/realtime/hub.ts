import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { getSessionUser } from '../auth/service.js';

export type RealtimeEvent =
  | 'message:new'
  | 'message:status'
  | 'conversation:updated'
  | 'conversation:created'
  | 'window:reopened'
  | 'lead:stage_changed'
  | 'lead:assigned'
  | 'lead:deleted'
  | 'template:status_changed'
  | 'inbox:status_changed'
  | 'broadcast:status_changed'
  | 'broadcast:recipient_update'
  | 'assignment:rule_created'
  | 'assignment:rule_updated'
  | 'assignment:rule_deleted'
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'alert:new'
  | 'alert:updated'
  | 'alert:rule_created'
  | 'alert:rule_updated'
  | 'alert:rule_deleted'
  | 'landing:updated'
  | 'landing:deleted'
  | 'landing:submission';

const clients = new Set<WebSocket>();

/** Difunde un evento de dominio a todos los paneles conectados. */
export function broadcast(event: RealtimeEvent, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

export function registerRealtime(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const user = await getSessionUser(request.cookies['sid']);
    if (!user) {
      socket.close(4401, 'No autenticado');
      return;
    }
    clients.add(socket);
    socket.on('message', (raw: Buffer) => {
      if (raw.toString() === 'ping') socket.send('pong');
    });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
}
