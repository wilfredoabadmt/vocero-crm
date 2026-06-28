export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WindowState {
  open: boolean;
  expiresAt: string | null; // ISO; null si nunca hubo mensaje entrante
}

/**
 * Estado de la ventana de servicio de 24 h de Meta.
 * Se calcula desde el timestamp DEL CANAL del último mensaje entrante.
 * Ante ausencia o ambigüedad se considera cerrada (regla de la spec).
 */
export function windowState(lastInboundAt: Date | null | undefined, now: Date = new Date()): WindowState {
  if (!lastInboundAt || Number.isNaN(lastInboundAt.getTime())) return { open: false, expiresAt: null };
  const expiresAt = new Date(lastInboundAt.getTime() + WINDOW_MS);
  return { open: now.getTime() < expiresAt.getTime(), expiresAt: expiresAt.toISOString() };
}
