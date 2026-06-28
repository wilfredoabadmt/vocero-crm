import { QueryClient } from '@tanstack/react-query';
import type { ConversationSummary, Message } from './types';

export type WsEvent =
  | { event: 'message:new'; data: { message: Message; conversation: ConversationSummary } }
  | { event: 'message:status'; data: { message_id: number; conversation_id: number; status: string; failure_reason: string | null } }
  | { event: 'conversation:updated'; data: ConversationSummary }
  | { event: 'window:reopened'; data: { conversation_id: number; expiresAt: string } }
  | { event: 'lead:stage_changed'; data: { contact_id: number; stage_id: number; by_user_id: number } }
  | { event: 'template:status_changed'; data: { template_id: number; inbox_id: number; status: string; rejection_reason: string | null } }
  | { event: 'inbox:status_changed'; data: { inbox_id: number; status: string; last_error: string | null } }
  | { event: 'broadcast:status_changed'; data: { campaign_id: number; status: string; stats?: Record<string, number> } }
  | { event: 'broadcast:recipient_update'; data: { campaign_id: number; contact_id: number; status: string; wamid?: string } }
  | { event: 'lead:assigned'; data: { contact_id: number; assigned_to: number; rule_id: number } }
  | { event: 'assignment:rule_created'; data: { rule_id: number } }
  | { event: 'assignment:rule_updated'; data: { rule_id: number } }
  | { event: 'assignment:rule_deleted'; data: { rule_id: number } }
  | { event: 'task:created'; data: { task: Record<string, unknown> } }
  | { event: 'task:updated'; data: { task: Record<string, unknown> } }
  | { event: 'task:deleted'; data: { task_id: number } }
  | { event: 'alert:new'; data: { alert_id: number; contact_id: number; rule_id: number } }
  | { event: 'alert:updated'; data: { alert_id: number; status: string } }
  | { event: 'alert:rule_created'; data: { rule_id: number } }
  | { event: 'alert:rule_updated'; data: { rule_id: number } }
  | { event: 'alert:rule_deleted'; data: { rule_id: number } }
  | { event: 'landing:updated'; data: { page_id: number } }
  | { event: 'landing:deleted'; data: { page_id: number } }
  | { event: 'landing:submission'; data: { page_id: number; submission_id: number; contact_id: number | null } };

type Listener = (event: WsEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectDelay = 1000;
let stopped = false;
let queryClient: QueryClient | null = null;

export function onWsEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function invalidate(event: WsEvent) {
  if (!queryClient) return;
  const qc = queryClient;
  switch (event.event) {
    case 'message:new':
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages', event.data.message.conversation_id] });
      qc.invalidateQueries({ queryKey: ['conversation', event.data.message.conversation_id] });
      qc.invalidateQueries({ queryKey: ['kanban'] });
      break;
    case 'message:status':
      qc.invalidateQueries({ queryKey: ['messages', event.data.conversation_id] });
      break;
    case 'conversation:updated':
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', event.data.id] });
      break;
    case 'window:reopened':
      qc.invalidateQueries({ queryKey: ['conversation', event.data.conversation_id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      break;
    case 'lead:stage_changed':
      qc.invalidateQueries({ queryKey: ['kanban'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      break;
    case 'template:status_changed':
      qc.invalidateQueries({ queryKey: ['templates'] });
      break;
    case 'inbox:status_changed':
      qc.invalidateQueries({ queryKey: ['inboxes'] });
      break;
    case 'broadcast:status_changed':
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      break;
    case 'broadcast:recipient_update':
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      break;
    case 'lead:assigned':
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['kanban'] });
      qc.invalidateQueries({ queryKey: ['assignment-stats'] });
      break;
    case 'assignment:rule_created':
    case 'assignment:rule_updated':
    case 'assignment:rule_deleted':
      qc.invalidateQueries({ queryKey: ['assignment-rules'] });
      break;
    case 'task:created':
    case 'task:updated':
    case 'task:deleted':
      qc.invalidateQueries({ queryKey: ['tasks'] });
      break;
    case 'alert:new':
    case 'alert:updated':
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-count'] });
      break;
    case 'alert:rule_created':
    case 'alert:rule_updated':
    case 'alert:rule_deleted':
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      break;
    case 'landing:updated':
    case 'landing:deleted':
    case 'landing:submission':
      qc.invalidateQueries({ queryKey: ['landing-pages'] });
      break;
  }
}

let everConnected = false;
let receivedAny = false;

function connect() {
  if (stopped) return;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${proto}://${window.location.host}/ws`);
  receivedAny = false;

  socket.onopen = () => {
    reconnectDelay = 1000;
    // Resincronización tras una reconexión real: lo que pasó offline se refetchea
    if (everConnected) queryClient?.invalidateQueries();
  };

  socket.onmessage = (raw) => {
    everConnected = true;
    receivedAny = true;
    if (raw.data === 'pong') return;
    try {
      const event = JSON.parse(raw.data as string) as WsEvent;
      invalidate(event);
      for (const listener of listeners) listener(event);
    } catch {
      // mensaje no JSON: ignorar
    }
  };

  socket.onclose = (e) => {
    socket = null;
    if (stopped) return;
    // 4401 = aún sin sesión (p. ej. en la pantalla de login): reintenta despacio
    // hasta que el usuario inicie sesión, en vez de matar la reconexión.
    if (e.code === 4401) {
      setTimeout(connect, 3000);
      return;
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
  };

  socket.onerror = () => socket?.close();
}

export function startRealtime(qc: QueryClient) {
  queryClient = qc;
  stopped = false;
  connect();
  // keepalive
  setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
  }, 30000);
}

/** Fuerza una reconexión inmediata (p. ej. justo después de iniciar sesión). */
export function reconnectRealtime() {
  stopped = false;
  reconnectDelay = 1000;
  const rs = socket?.readyState;
  if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;
  connect();
}

export function stopRealtime() {
  stopped = true;
  socket?.close();
}
