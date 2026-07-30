/**
 * Bus de eventos in-process por organización.
 *
 * Publicar SIEMPRE después del commit de BD. Una instancia = un proceso,
 * así que un EventEmitter es suficiente (sin colas externas).
 *
 * Este bus alimenta el SSE (Server-Sent Events) que la UI consume para
 * actualizaciones en tiempo real.
 */

import { EventEmitter } from "node:events";

// ─── Tipos de evento ──────────────────────────────────────────────────────────

export type SseEvent =
  | {
      type: "message.new";
      data: { conversationId: string; message: unknown };
    }
  | {
      type: "message.status";
      data: { conversationId: string; messageId: string; status: string };
    }
  | {
      type: "conversation.updated";
      data: { conversation: unknown };
    }
  | {
      type: "lab.run";
      data: {
        runId: string;
        status: string;
        progress: { done: number; total: number };
        score?: number | null;
      };
    };

// ─── Singleton ────────────────────────────────────────────────────────────────

const globalForBus = globalThis as unknown as { __toiBus?: EventEmitter };

function getBus(): EventEmitter {
  if (!globalForBus.__toiBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(200);
    globalForBus.__toiBus = bus;
  }
  return globalForBus.__toiBus;
}

/**
 * Publica un evento para una organización específica.
 */
export function publish(
  organizationId: string,
  event: SseEvent
): void {
  getBus().emit(`org:${organizationId}`, event);
}

/**
 * Suscribe un listener a los eventos de una organización.
 * Retorna una función para desuscribirse.
 */
export function subscribe(
  organizationId: string,
  listener: (event: SseEvent) => void
): () => void {
  const bus = getBus();
  const channel = `org:${organizationId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
