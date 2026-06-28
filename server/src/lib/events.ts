import { EventEmitter } from 'node:events';

export const eventBus = new EventEmitter();

// Definición de tipos de eventos para autocompletado y robustez
export interface EventPayloads {
  'lead:stage_changed': {
    contactId: number;
    fromStageId: number;
    toStageId: number;
  };
  'message:created': {
    messageId: number;
    conversationId: number;
    direction: 'in' | 'out';
    body: string | null;
  };
}

export const emitEvent = <K extends keyof EventPayloads>(event: K, payload: EventPayloads[K]) => {
  eventBus.emit(event, payload);
};

export const onEvent = <K extends keyof EventPayloads>(event: K, handler: (payload: EventPayloads[K]) => void | Promise<void>) => {
  eventBus.on(event, (data) => {
    void Promise.resolve(handler(data)).catch((err) => {
      console.error(`Error en el manejador del evento ${event}:`, err);
    });
  });
};
