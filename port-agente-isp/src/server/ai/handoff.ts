/**
 * Patrones de RESPALDO de escalado. Se evalúan sobre el mensaje del abonado
 * ANTES de llamar al LLM: si matchean, el handoff ocurre aunque el modelo no
 * lo detecte (y sin gastar una llamada al proveedor).
 *
 * Diseño: precisión sobre exhaustividad. Un handoff falso mata el valor de la
 * automatización, así que cada patrón exige un verbo/objeto explícito. Los
 * casos límite reales del negocio están en tests/unit/agent-isp.test.ts.
 */

export type HandoffReason = "cliente" | "modelo" | "error" | "ventana" | "retencion" | "legal";

/**
 * Pide hablar con una persona.
 * Exige un verbo de contacto cerca del objeto humano → "somos 4 personas" NO matchea.
 */
export const HANDOFF_HUMAN_REGEX =
  /(hablar|comunicar|contactar|pasar|transferir)[\s\S]{0,40}?(asesor|humano|persona|alguien|agente real|operador|ejecutivo)|un asesor|atenci[oó]n humana|persona real/i;

/**
 * Intención de baja o cambio de proveedor → retención es SIEMPRE humana.
 * Exige objeto explícito: "se me bajó el internet" y "bajó la velocidad" NO matchean.
 */
export const HANDOFF_RETENTION_REGEX =
  /(dar(me|le)?\s+de\s+baja|solicitar\s+la\s+baja|tramitar\s+la\s+baja|cancelar\s+(el|mi|la)\s+(servicio|contrato|internet|plan|l[ií]nea)|dar\s+de\s+baja\s+(el|mi)\s+(servicio|contrato)|ya\s+no\s+quiero\s+(el\s+)?(servicio|internet)|me\s+(voy\s+a\s+)?cambi(o|ar)\s+de\s+(proveedor|compa[ñn][ií]a|empresa)|termina(r)?\s+(el|mi)\s+contrato)/i;

/**
 * Amenaza legal o queja formal → nunca la negocia un bot.
 */
export const HANDOFF_LEGAL_REGEX =
  /(profeco|condusef|demanda(r|rlos)?|los\s+demando|abogad[oa]|queja\s+formal|denuncia(r)?|acci[oó]n\s+legal|ife?tel|autoridad)/i;

/**
 * Devuelve el motivo de escalado detectado, o null si no hay ninguno.
 * El orden importa: lo legal manda sobre lo comercial.
 */
export function detectHandoffIntent(text: string): HandoffReason | null {
  if (HANDOFF_LEGAL_REGEX.test(text)) return "legal";
  if (HANDOFF_RETENTION_REGEX.test(text)) return "retencion";
  if (HANDOFF_HUMAN_REGEX.test(text)) return "cliente";
  return null;
}

/** Azúcar para los tests y para call sites que sólo quieren el booleano. */
export function matchesHandoffIntent(text: string): boolean {
  return detectHandoffIntent(text) !== null;
}

/** Mensaje de despedida por defecto según el motivo. */
export function handoffFarewell(reason: HandoffReason): string | null {
  switch (reason) {
    case "cliente":
      return "Claro, en un momento te contacta una persona del equipo.";
    case "retencion":
      return "Entiendo. Voy a pasarte con una persona del equipo para revisar tu caso.";
    case "legal":
      return "Voy a pasar tu caso con el área correspondiente para darle seguimiento.";
    case "ventana":
      // Fuera de la ventana de 24h no se puede enviar texto libre: silencio.
      return null;
    case "modelo":
    case "error":
      return null;
  }
}
