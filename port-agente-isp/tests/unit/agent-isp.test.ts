import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/ai";
import {
  AgentAction,
  degradeAction,
  resolveTicketCategory,
  validatePromiseDate,
} from "@/server/ai/actions";
import {
  daysSince,
  normalizeServiceStatus,
  renderAccountContext,
  UNKNOWN_ACCOUNT,
  type AccountSnapshot,
} from "@/server/ai/account-context";
import { detectHandoffIntent, matchesHandoffIntent } from "@/server/ai/handoff";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";

/* -------------------------------------------------------------------------- */
/* Escalado de respaldo                                                        */
/* -------------------------------------------------------------------------- */

describe("patrón de respaldo de escalado", () => {
  it.each([
    "quiero hablar con un humano",
    "¿puedo hablar con un asesor?",
    "necesito comunicarme con alguien",
    "me pasas a un asesor",
    "prefiero atención humana",
    "quiero hablar con una persona real",
  ])("escala por petición de humano: %s", (text) => {
    expect(detectHandoffIntent(text)).toBe("cliente");
  });

  it.each([
    "quiero dar de baja el servicio",
    "necesito cancelar mi contrato",
    "ya no quiero el servicio",
    "me voy a cambiar de proveedor",
    "quiero cancelar mi internet",
  ])("escala por retención: %s", (text) => {
    expect(detectHandoffIntent(text)).toBe("retencion");
  });

  it.each([
    "los voy a demandar",
    "voy a poner una queja formal en PROFECO",
    "ya hablé con mi abogado",
  ])("escala por amenaza legal: %s", (text) => {
    expect(detectHandoffIntent(text)).toBe("legal");
  });

  // Falsos positivos: cada uno cuesta una conversación automatizada.
  it.each([
    "somos 4 personas en la casa y todos se quejan",
    "se me bajó el internet otra vez",
    "la velocidad bajó mucho ayer",
    "la persona que vino a instalar fue muy amable",
    "¿tienen plan de 100 megas?",
    "ya pagué, les mando el comprobante",
    "el módem se apagó solo",
  ])("NO escala: %s", (text) => {
    expect(matchesHandoffIntent(text)).toBe(false);
  });

  it("lo legal manda sobre lo comercial", () => {
    expect(
      detectHandoffIntent("quiero cancelar el servicio y los voy a demandar")
    ).toBe("legal");
  });
});

/* -------------------------------------------------------------------------- */
/* Promesa de pago                                                             */
/* -------------------------------------------------------------------------- */

describe("validación de la fecha de promesa de pago", () => {
  const today = new Date("2026-07-25T12:00:00.000Z");

  it("acepta hoy", () => {
    expect(validatePromiseDate("2026-07-25", { maxDays: 7, today })).toEqual({
      ok: true,
      date: "2026-07-25",
    });
  });

  it("acepta el límite exacto", () => {
    expect(validatePromiseDate("2026-08-01", { maxDays: 7, today })).toEqual({
      ok: true,
      date: "2026-08-01",
    });
  });

  it("rechaza una fecha pasada", () => {
    expect(validatePromiseDate("2026-07-24", { maxDays: 7, today })).toEqual({
      ok: false,
      reason: "pasada",
    });
  });

  it("rechaza una fecha más allá del máximo", () => {
    expect(validatePromiseDate("2026-08-02", { maxDays: 7, today })).toEqual({
      ok: false,
      reason: "muy_lejana",
    });
  });

  it.each(["mañana", "25/07/2026", "2026-7-5", "", "2026-02-31"])(
    "rechaza formato inválido: %s",
    (raw) => {
      expect(validatePromiseDate(raw, { maxDays: 7, today })).toEqual({
        ok: false,
        reason: "formato",
      });
    }
  );
});

/* -------------------------------------------------------------------------- */
/* Categorías y degradación                                                    */
/* -------------------------------------------------------------------------- */

describe("allowlist de categorías de ticket", () => {
  it("resuelve variantes con acento, mayúscula y espacio", () => {
    expect(resolveTicketCategory("Equipo Dañado")).toBe("equipo_dañado");
    expect(resolveTicketCategory("SIN SERVICIO")).toBe("sin_servicio");
    expect(resolveTicketCategory("sin-servicio")).toBe("sin_servicio");
  });

  it("rechaza lo que el modelo se inventa", () => {
    expect(resolveTicketCategory("reconexion_inmediata")).toBeNull();
    expect(resolveTicketCategory("descuento")).toBeNull();
  });
});

describe("degradación de acciones inválidas", () => {
  it("conserva el texto para el abonado cuando lo hay", () => {
    expect(
      degradeAction({
        action: "registrar_promesa_pago",
        fecha: "2030-01-01",
        reply: "Perfecto, lo anoto.",
      })
    ).toEqual({ action: "reply", text: "Perfecto, lo anoto." });
  });

  it("cae a silencio cuando no hay nada que decir", () => {
    expect(
      degradeAction({ action: "nota_abonado", note: "molesto" })
    ).toEqual({ action: "none" });
  });
});

/* -------------------------------------------------------------------------- */
/* Contrato de salida del modelo                                               */
/* -------------------------------------------------------------------------- */

describe("esquema de acción del agente", () => {
  it("acepta una acción bien formada", () => {
    const parsed = AgentAction.safeParse({
      action: "crear_ticket",
      categoria: "sin_servicio",
      descripcion: "Sin luz en el ONU tras reiniciar",
      reply: "Listo, ya reporté tu falla.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rechaza una acción que no existe (p. ej. reconectar)", () => {
    const parsed = AgentAction.safeParse({
      action: "reconectar_servicio",
      reply: "Ya te reconecté",
    });
    expect(parsed.success).toBe(false);
  });

  it("extrae JSON aunque venga envuelto en markdown", () => {
    const raw = 'Claro:\n```json\n{"action":"reply","text":"Hola"}\n```';
    expect(extractJson(raw)).toEqual({ action: "reply", text: "Hola" });
  });
});

/* -------------------------------------------------------------------------- */
/* Contexto de cuenta                                                          */
/* -------------------------------------------------------------------------- */

const cuenta: AccountSnapshot = {
  found: true,
  subscriberId: "sub_1",
  nombre: "María Ruiz",
  codigoCliente: "A-1042",
  plan: { nombre: "Fibra 100", precio: "499.00" },
  estadoServicio: "cortado",
  saldoVencido: "998.00",
  moneda: "MXN",
  diasVencido: 12,
  fechaCorte: "2026-07-20",
  ultimoPago: { fecha: "2026-05-18", monto: "499.00" },
  promesaVigente: null,
  ticketsAbiertos: [],
  comprobantesEnRevision: 0,
};

describe("render del estado de cuenta", () => {
  it("incluye las cifras exactas y el estado del servicio", () => {
    const out = renderAccountContext(cuenta);
    expect(out).toContain("María Ruiz");
    expect(out).toContain("998.00");
    expect(out).toContain("CORTADO por falta de pago");
    expect(out).toContain("12 día(s) de atraso");
  });

  it("un teléfono desconocido no filtra datos de nadie", () => {
    const out = renderAccountContext(UNKNOWN_ACCOUNT);
    expect(out).toContain("NO IDENTIFICADO");
    expect(out).not.toContain("Saldo VENCIDO");
  });

  it("una promesa vigente bloquea registrar otra", () => {
    const out = renderAccountContext({
      ...cuenta,
      promesaVigente: { fecha: "2026-07-28", monto: "998.00" },
    });
    expect(out).toContain("PROMESA DE PAGO VIGENTE");
    expect(out).toContain("NO registres otra promesa");
  });

  it("un comprobante en revisión evita confirmar el pago", () => {
    const out = renderAccountContext({ ...cuenta, comprobantesEnRevision: 1 });
    expect(out).toContain("EN REVISIÓN");
    expect(out).toContain("NO pidas otro comprobante");
  });

  it("normaliza los estados de servicio del ISP", () => {
    expect(normalizeServiceStatus("MOROSO")).toBe("cortado");
    expect(normalizeServiceStatus("active")).toBe("activo");
    expect(normalizeServiceStatus("lo que sea")).toBe("desconocido");
  });

  it("calcula los días de atraso", () => {
    expect(daysSince("2026-07-13", new Date("2026-07-25T05:00:00Z"))).toBe(12);
    expect(daysSince(null)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* System prompt                                                               */
/* -------------------------------------------------------------------------- */

const perfil = {
  name: "Asistente RedNet",
  tone: "cercano y directo",
  instructions: null,
  escalationRules: null,
  greeting: null,
  paymentInstructions: "SPEI CLABE 012345678901234567",
  allowPaymentPromise: true,
  allowTicketCreation: true,
  allowReceiptCapture: true,
  maxPromiseDays: 7,
};

describe("system prompt del agente", () => {
  const today = new Date("2026-07-25T12:00:00.000Z");

  it("inyecta identidad, fecha, estado de cuenta y formas de pago", () => {
    const p = buildAgentSystemPrompt({
      profile: perfil,
      kb: [{ kind: "qa", question: "¿Cobertura?", answer: "Centro y Norte", content: null }],
      account: cuenta,
      today,
    });
    expect(p).toContain("Asistente RedNet");
    expect(p).toContain("Hoy es 2026-07-25");
    expect(p).toContain("998.00");
    expect(p).toContain("CLABE 012345678901234567");
    expect(p).toContain("Centro y Norte");
    expect(p).toContain("2026-08-01"); // fecha máxima de promesa
  });

  it("declara los límites duros de dinero y reconexión", () => {
    const p = buildAgentSystemPrompt({ profile: perfil, kb: [], account: cuenta, today });
    expect(p).toContain("no condonas deuda");
    expect(p).toContain("no puedes reconectar");
    expect(p).toContain("no confirmas que un pago fue aplicado");
  });

  it("no ofrece acciones que la organización tiene apagadas", () => {
    const p = buildAgentSystemPrompt({
      profile: { ...perfil, allowTicketCreation: false, allowPaymentPromise: false },
      kb: [],
      account: cuenta,
      today,
    });
    expect(p).not.toContain("crear_ticket");
    expect(p).not.toContain("registrar_promesa_pago");
    expect(p).toContain("registrar_comprobante");
  });

  it("con teléfono desconocido no expone datos de cuenta", () => {
    const p = buildAgentSystemPrompt({
      profile: perfil,
      kb: [],
      account: UNKNOWN_ACCOUNT,
      today,
    });
    expect(p).toContain("NO IDENTIFICADO");
    expect(p).not.toContain("María Ruiz");
  });
});
