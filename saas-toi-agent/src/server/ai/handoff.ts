/**
 * Patrón de RESPALDO de intención de escalado (FR-022).
 *
 * Se evalúa sobre el mensaje del cliente ANTES del LLM: si matchea,
 * el handoff ocurre aunque el modelo no lo detecte.
 *
 * Diseñado para exigir un verbo de contacto cerca del objeto humano —
 * "somos 4 personas" NO matchea (test unitario).
 *
 * Para tu SaaS TOI: puedes agregar variantes específicas de ISP como
 * "hablar con cobranzas", "atención al cliente", "soporte técnico".
 */

export const HANDOFF_BACKUP_REGEX =
  /(hablar|comunicar|contactar)[\s\S]{0,40}?(asesor|humano|persona|alguien|soporte|cobranzas|técnico)|un asesor|atenci[oó]n humana|soporte técnico/i;

export function matchesHandoffIntent(text: string): boolean {
  return HANDOFF_BACKUP_REGEX.test(text);
}
