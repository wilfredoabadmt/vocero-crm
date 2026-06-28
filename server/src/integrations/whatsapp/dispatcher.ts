import type { WebhookPayload } from './types.js';

type Dispatch = (payload: WebhookPayload, source: 'meta' | 'simulation') => Promise<void>;

let dispatchFn: Dispatch | null = null;

/** El bootstrap registra aquí el pipeline de ingesta; el mock de Graph lo usa para emitir webhooks sintéticos. */
export function registerWebhookDispatcher(fn: Dispatch) {
  dispatchFn = fn;
}

export async function dispatchWebhook(payload: WebhookPayload, source: 'meta' | 'simulation') {
  if (!dispatchFn) throw new Error('Webhook dispatcher no inicializado');
  await dispatchFn(payload, source);
}
