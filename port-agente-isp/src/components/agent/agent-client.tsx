"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Sección "Agente de IA".
 *
 * Deliberadamente SIN dependencias de librería de componentes: sólo React +
 * Tailwind, para que se pueda pegar en cualquier proyecto. Si ya usas shadcn/ui
 * u otro sistema, sustituye los <input>/<button> por los tuyos: la lógica de
 * datos (fetch + refetch) no cambia.
 */

type Profile = {
  enabled: boolean;
  name: string;
  tone: string | null;
  instructions: string | null;
  escalationRules: string | null;
  greeting: string | null;
  paymentInstructions: string | null;
  allowPaymentPromise: boolean;
  allowTicketCreation: boolean;
  allowReceiptCapture: boolean;
  maxPromiseDays: number;
};

type KbEntry = {
  id: string;
  kind: "qa" | "block";
  question: string | null;
  answer: string | null;
  content: string | null;
};

type KbSize = { chars: number; warnAt: number; warning: boolean };

/* -------------------------------------------------------------------------- */
/* Primitivas locales                                                          */
/* -------------------------------------------------------------------------- */

function Card(props: { title: string; description?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">{props.title}</h3>
          {props.description && (
            <p className="mt-0.5 text-xs text-neutral-400">{props.description}</p>
          )}
        </div>
        {props.right}
      </div>
      <div className="space-y-4">{props.children}</div>
    </section>
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-300">{props.label}</span>
      {props.children}
      {props.hint && <span className="block text-[11px] text-neutral-500">{props.hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-600";

function Toggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-neutral-200">{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          props.checked ? "bg-emerald-500" : "bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            props.checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function Button(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const base =
    "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40";
  const style =
    props.variant === "ghost"
      ? "text-neutral-400 hover:text-red-400"
      : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400";
  return (
    <button type="button" className={`${base} ${style}`} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Pantalla                                                                    */
/* -------------------------------------------------------------------------- */

export function AgentClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [kbSize, setKbSize] = useState<KbSize | null>(null);
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

  const saveProfile = useCallback(
    async (patch: Partial<Profile>) => {
      await fetch("/api/agent/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void refetch();
    },
    [refetch]
  );

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Cargando…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div>
          <h2 className="font-semibold text-neutral-100">Agente de IA</h2>
          <p className="text-xs text-neutral-500">
            Responde cobranza y soporte de primer nivel por WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-400">Guardado ✓</span>}
          <span className="text-sm text-neutral-400">
            {profile.enabled ? "Encendido" : "Apagado"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={profile.enabled}
            aria-label="Agente encendido"
            disabled={!aiConfigured}
            onClick={() => void saveProfile({ enabled: !profile.enabled })}
            className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${
              profile.enabled ? "bg-emerald-500" : "bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                profile.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </header>

      {!aiConfigured && (
        <div className="mx-6 mt-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-5 text-center">
          <p className="font-medium text-neutral-100">
            Configura tu proveedor de IA para activar el agente
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-neutral-400">
            Agrega <code className="rounded bg-neutral-800 px-1">OPENROUTER_API_TOKEN</code> y{" "}
            <code className="rounded bg-neutral-800 px-1">OPENROUTER_MODEL</code> a las variables
            de entorno de la instancia y reiníciala. Mientras tanto puedes dejar listo el
            comportamiento y el conocimiento aquí abajo.
          </p>
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-6">
          <BehaviorCard profile={profile} onSave={saveProfile} />
          <CapabilitiesCard profile={profile} onSave={saveProfile} />
        </div>
        <KbCard entries={entries} kbSize={kbSize} onChanged={() => void refetch()} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BehaviorCard({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  const [form, setForm] = useState(profile);
  useEffect(() => setForm(profile), [profile]);

  return (
    <Card
      title="Comportamiento"
      description="Cómo se presenta y actúa el agente al hablar con tus abonados."
    >
      <Field label="Nombre del agente">
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>

      <Field label="Tono" hint="p. ej. cercano y directo, hablando de usted">
        <input
          className={inputClass}
          placeholder="cercano y directo, de usted"
          value={form.tone ?? ""}
          onChange={(e) => setForm({ ...form, tone: e.target.value })}
        />
      </Field>

      <Field label="Saludo para conversaciones nuevas">
        <input
          className={inputClass}
          placeholder="Hola, soy el asistente de RedNet. ¿En qué te ayudo?"
          value={form.greeting ?? ""}
          onChange={(e) => setForm({ ...form, greeting: e.target.value })}
        />
      </Field>

      <Field
        label="Instrucciones del negocio"
        hint="Qué debe y qué no debe hacer, más allá de las reglas base."
      >
        <textarea
          className={inputClass}
          rows={5}
          value={form.instructions ?? ""}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
        />
      </Field>

      <Field
        label="Reglas de escalado"
        hint="Cuándo pasar la conversación a una persona del equipo."
      >
        <textarea
          className={inputClass}
          rows={3}
          value={form.escalationRules ?? ""}
          onChange={(e) => setForm({ ...form, escalationRules: e.target.value })}
        />
      </Field>

      <Field
        label="Formas de pago"
        hint="El agente las dicta textualmente. Cuidado: van tal cual al abonado."
      >
        <textarea
          className={inputClass}
          rows={4}
          placeholder={"Transferencia SPEI: CLABE 012...\nOXXO: tarjeta 4152...\nEn oficina: Av. Juárez 45, L-V 9-18h"}
          value={form.paymentInstructions ?? ""}
          onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
        />
      </Field>

      <Button onClick={() => void onSave(form)}>Guardar comportamiento</Button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function CapabilitiesCard({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  return (
    <Card
      title="Capacidades"
      description="Qué puede escribir el agente en tu base de datos. Lo apagado aquí es imposible, no sólo desaconsejado."
    >
      <Toggle
        label="Registrar promesas de pago"
        checked={profile.allowPaymentPromise}
        onChange={(v) => void onSave({ allowPaymentPromise: v })}
      />
      <Toggle
        label="Abrir tickets de soporte"
        checked={profile.allowTicketCreation}
        onChange={(v) => void onSave({ allowTicketCreation: v })}
      />
      <Toggle
        label="Registrar comprobantes de pago"
        checked={profile.allowReceiptCapture}
        onChange={(v) => void onSave({ allowReceiptCapture: v })}
      />

      <Field
        label="Días máximos para una promesa de pago"
        hint="Una fecha más lejana se rechaza en el servidor, aunque el modelo la proponga."
      >
        <input
          type="number"
          min={1}
          max={30}
          className={inputClass}
          value={profile.maxPromiseDays}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= 30) {
              void onSave({ maxPromiseDays: n });
            }
          }}
        />
      </Field>

      <p className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-[11px] leading-relaxed text-neutral-400">
        El agente <strong className="text-neutral-200">nunca</strong> reconecta ni corta el
        servicio, no aprueba pagos, no condona deuda y no procesa bajas. Esas acciones son
        humanas por diseño: no están en su repertorio.
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function KbCard({
  entries,
  kbSize,
  onChanged,
}: {
  entries: KbEntry[];
  kbSize: KbSize | null;
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
    <Card
      title="Conocimiento"
      description="La única fuente de políticas del agente: planes, cobertura, horarios, proceso de instalación. Lo que no está aquí, no lo afirma."
      right={
        kbSize ? (
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
              kbSize.warning
                ? "bg-amber-950 text-amber-400"
                : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {kbSize.chars.toLocaleString("es-MX")} caracteres
          </span>
        ) : null
      }
    >
      {kbSize?.warning && (
        <p className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-[11px] text-amber-300">
          El conocimiento se acerca al límite práctico del contexto: se inyecta completo en
          cada turno, así que también es costo por mensaje. Considera depurar entradas.
        </p>
      )}

      <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
        <p className="text-xs font-medium text-neutral-300">Nueva pregunta / respuesta</p>
        <input
          className={inputClass}
          placeholder="¿Tienen cobertura en la colonia Centro?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Sí, con fibra hasta 200 Mbps. Instalación en 48h hábiles."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <Button onClick={() => void addQa()} disabled={!question.trim() || !answer.trim()}>
          Agregar P/R
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
        <p className="text-xs font-medium text-neutral-300">Nuevo bloque de texto libre</p>
        <textarea
          className={inputClass}
          rows={3}
          placeholder="Horarios de oficina, zonas de cobertura, políticas de reconexión…"
          value={block}
          onChange={(e) => setBlock(e.target.value)}
        />
        <Button onClick={() => void addBlock()} disabled={!block.trim()}>
          Agregar bloque
        </Button>
      </div>

      <ul className="space-y-2">
        {entries.map((e) => (
          <li
            key={e.id}
            className="flex items-start gap-2 rounded-lg border border-neutral-800 p-3"
          >
            <div className="min-w-0 flex-1 text-sm">
              {e.kind === "qa" ? (
                <>
                  <p className="font-medium text-neutral-200">{e.question}</p>
                  <p className="mt-0.5 text-neutral-400">{e.answer}</p>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-neutral-400">{e.content}</p>
              )}
            </div>
            <Button variant="ghost" onClick={() => void remove(e.id)}>
              Eliminar
            </Button>
          </li>
        ))}
        {entries.length === 0 && (
          <p className="py-2 text-center text-xs text-neutral-500">
            Sin entradas todavía: agrega lo que el agente debe saber.
          </p>
        )}
      </ul>
    </Card>
  );
}
