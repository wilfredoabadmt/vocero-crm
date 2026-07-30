"use client";

/**
 * Panel de configuración del Agente de IA para SaaS TOI (ISP).
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  ADAPTACIÓN:                                                        ║
 * ║  - Reemplaza los componentes UI (Card, Input, Textarea, etc.)        ║
 * ║    por los de tu librería de componentes (shadcn/ui, Tailwind, etc.) ║
 * ║  - Los endpoints (/api/agent/profile, /api/kb) deben existir         ║
 * ║  - Si tu app usa App Router + Server Components, asegúrate de que    ║
 * ║    los fetch sean desde un "use client" component (como este).       ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

import { useCallback, useEffect, useState } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Profile = {
  enabled: boolean;
  name: string;
  tone: string | null;
  instructions: string | null;
  escalationRules: string | null;
  greeting: string | null;
};

type KbEntry = {
  id: string;
  kind: "qa" | "block";
  question: string | null;
  answer: string | null;
  content: string | null;
};

// ─── Componente Principal ─────────────────────────────────────────────────────

export function AgentClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [kbSize, setKbSize] = useState<{
    chars: number;
    warnAt: number;
    warning: boolean;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  const refetch = useCallback(async () => {
    const [p, kb, size] = await Promise.all([
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb/size").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null]);

    if (p) {
      setProfile(p.profile);
      setAiConfigured(p.aiConfigured);
    }
    if (kb) setEntries(kb.entries);
    if (size) setKbSize(size);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  async function saveProfile(patch: Partial<Profile>) {
    await fetch("/api/agent/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    void refetch();
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* ─── Header con toggle ─── */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">🤖 Agente de IA</h2>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            ISP
          </span>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-green-600 font-medium">
              Guardado ✓
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {profile.enabled ? "🟢 Encendido" : "🔴 Apagado"}
          </span>
          <button
            role="switch"
            aria-checked={profile.enabled}
            aria-label="Agente encendido"
            disabled={!aiConfigured}
            onClick={() => void saveProfile({ enabled: !profile.enabled })}
            className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${
              profile.enabled ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                profile.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </header>

      {/* ─── Banner si no hay IA configurada ─── */}
      {!aiConfigured && (
        <div className="mx-6 mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-2xl mb-2">⚙️</p>
          <p className="font-medium text-amber-800">
            Configura tu proveedor de IA para activar el agente
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
            Agrega{" "}
            <code className="rounded bg-amber-100 px-1">
              OPENROUTER_API_TOKEN
            </code>{" "}
            y{" "}
            <code className="rounded bg-amber-100 px-1">
              OPENROUTER_MODEL
            </code>{" "}
            a las variables de entorno de la instancia y reiníciala. Mientras
            tanto puedes dejar listo el comportamiento y el conocimiento aquí
            abajo.
          </p>
        </div>
      )}

      {/* ─── Dos columnas: Comportamiento + KB ─── */}
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <ProfileSection profile={profile} onSave={saveProfile} />
        <KbSection
          entries={entries}
          kbSize={kbSize}
          onChanged={() => void refetch()}
        />
      </div>
    </div>
  );
}

// ─── Sección: Comportamiento ──────────────────────────────────────────────────

function ProfileSection({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  const [form, setForm] = useState(profile);
  useEffect(() => setForm(profile), [profile]);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-1">📋 Comportamiento</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Cómo se presenta y actúa el agente al responder a tus abonados por
        WhatsApp.
      </p>

      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label
            htmlFor="agent-name"
            className="block text-sm font-medium mb-1"
          >
            Nombre del agente
          </label>
          <input
            id="agent-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="p. ej. TOI Asistente"
          />
        </div>

        {/* Tono */}
        <div>
          <label
            htmlFor="agent-tone"
            className="block text-sm font-medium mb-1"
          >
            Tono
          </label>
          <input
            id="agent-tone"
            type="text"
            value={form.tone ?? ""}
            onChange={(e) => setForm({ ...form, tone: e.target.value })}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="p. ej. cercano y profesional, con usted"
          />
        </div>

        {/* Instrucciones */}
        <div>
          <label
            htmlFor="agent-instructions"
            className="block text-sm font-medium mb-1"
          >
            Instrucciones adicionales
          </label>
          <textarea
            id="agent-instructions"
            rows={5}
            value={form.instructions ?? ""}
            onChange={(e) =>
              setForm({ ...form, instructions: e.target.value })
            }
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Qué debe y no debe hacer el agente...&#10;Ejemplo: Siempre confirma el monto antes de informar sobre cortes."
          />
        </div>

        {/* Reglas de escalado */}
        <div>
          <label
            htmlFor="agent-escalation"
            className="block text-sm font-medium mb-1"
          >
            Reglas de escalado a humano
          </label>
          <textarea
            id="agent-escalation"
            rows={3}
            value={form.escalationRules ?? ""}
            onChange={(e) =>
              setForm({ ...form, escalationRules: e.target.value })
            }
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Cuándo pasar la conversación a un humano...&#10;Ejemplo: Quejas formales, problemas de MikroTik, solicitudes de baja."
          />
        </div>

        {/* Saludo */}
        <div>
          <label
            htmlFor="agent-greeting"
            className="block text-sm font-medium mb-1"
          >
            Saludo para conversaciones nuevas
          </label>
          <input
            id="agent-greeting"
            type="text"
            value={form.greeting ?? ""}
            onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="p. ej. ¡Hola! Soy el asistente virtual de [ISP]. ¿En qué te puedo ayudar?"
          />
        </div>

        <button
          onClick={() => void onSave(form)}
          className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          💾 Guardar comportamiento
        </button>
      </div>
    </div>
  );
}

// ─── Sección: Knowledge Base ──────────────────────────────────────────────────

function KbSection({
  entries,
  kbSize,
  onChanged,
}: {
  entries: KbEntry[];
  kbSize: { chars: number; warnAt: number; warning: boolean } | null;
  onChanged: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [block, setBlock] = useState("");

  async function addQa() {
    if (!question.trim() || !answer.trim()) return;
    await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "qa", question, answer }),
    }).catch(() => null);
    setQuestion("");
    setAnswer("");
    onChanged();
  }

  async function addBlock() {
    if (!block.trim()) return;
    await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "block", content: block }),
    }).catch(() => null);
    setBlock("");
    onChanged();
  }

  async function remove(id: string) {
    await fetch(`/api/kb/${id}`, { method: "DELETE" }).catch(() => null);
    onChanged();
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold">📚 Knowledge Base</h3>
        {kbSize && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              kbSize.warning
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {kbSize.chars.toLocaleString("es-MX")} caracteres
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        La única fuente de verdad del agente: lo que no está aquí, no lo afirma.
      </p>

      {kbSize?.warning && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
          ⚠️ El conocimiento se acerca al límite del contexto del modelo. La
          IA puede omitir información. Considera depurar entradas.
        </div>
      )}

      <div className="space-y-4">
        {/* Agregar P/R */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">➕ Nueva pregunta / respuesta</p>
          <input
            type="text"
            placeholder="Pregunta (p. ej. ¿Cuánto cuesta el plan de 100 Mbps?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Respuesta (p. ej. El plan de 100 Mbps cuesta $450 MXN mensuales...)"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <button
            onClick={() => void addQa()}
            disabled={!question.trim() || !answer.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            + Agregar P/R
          </button>
        </div>

        {/* Agregar bloque */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">📝 Nuevo bloque de texto libre</p>
          <textarea
            placeholder="Horarios, planes, precios, políticas, datos de pago..."
            rows={3}
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <button
            onClick={() => void addBlock()}
            disabled={!block.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            + Agregar bloque
          </button>
        </div>

        {/* Lista de entradas */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin entradas aún. Agrega conocimiento arriba.
            </p>
          )}
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-2 rounded-md border p-3 group hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1 text-sm">
                {e.kind === "qa" ? (
                  <>
                    <p className="font-medium text-blue-700">{e.question}</p>
                    <p className="text-muted-foreground mt-0.5">{e.answer}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {e.content}
                  </p>
                )}
              </div>
              <button
                onClick={() => void remove(e.id)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                title="Eliminar"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
