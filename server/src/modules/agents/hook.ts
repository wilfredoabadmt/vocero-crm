// Punto de enganche para la respuesta automática: la ingesta lo dispara y el
// módulo de agentes registra la implementación (evita import circular).

type AutoReplyTrigger = (conversationId: number) => void;

let trigger: AutoReplyTrigger = () => {};

export function setAutoReplyTrigger(fn: AutoReplyTrigger) {
  trigger = fn;
}

export function triggerAutoReply(conversationId: number) {
  trigger(conversationId);
}
