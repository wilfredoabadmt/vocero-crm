import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, ChevronLeft, ChevronRight, FileText, Search, Trash2, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Agent, AgentDocument, OrModel } from '@/lib/types';
import { cn } from '@/lib/utils';

const STEPS = ['Identidad', 'Comportamiento', 'Conocimiento', 'Modelo', 'Revisión'] as const;

interface Draft {
  name: string;
  purpose: string;
  tone: string;
  instructions: string;
  business_info: string;
  escalation_rules: string;
  model: string;
  is_default: boolean;
}

const EMPTY: Draft = {
  name: '',
  purpose: '',
  tone: '',
  instructions: '',
  business_info: '',
  escalation_rules: '',
  model: '',
  is_default: false,
};

function DocumentsStep({ agentId }: { agentId: number }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const docs = useQuery({
    queryKey: ['agent-docs', agentId],
    queryFn: () => api.get<{ items: AgentDocument[] }>(`/api/agents/${agentId}/documents`),
    refetchInterval: (q) => (q.state.data?.items.some((d) => d.status === 'processing') ? 1500 : false),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/api/agents/${agentId}/documents`, form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-docs', agentId] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo subir el documento'),
  });

  const remove = useMutation({
    mutationFn: (docId: number) => api.delete(`/api/documents/${docId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-docs', agentId] }),
  });

  return (
    <div className="space-y-3">
      <button
        className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) upload.mutate(file);
        }}
        data-testid="doc-dropzone"
      >
        <UploadCloud className="h-6 w-6" />
        <span className="text-sm font-medium">Arrastra un documento o haz clic para subirlo</span>
        <span className="text-xs">PDF, DOCX, TXT o MD · máx. 10 MB</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = '';
        }}
        data-testid="doc-input"
      />
      {upload.isPending && <Spinner className="p-2" />}
      <div className="space-y-2">
        {docs.data?.items.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{d.filename}</p>
              <p className="text-[11px] text-muted-foreground">{(d.size_bytes / 1024).toFixed(0)} KB</p>
            </div>
            {d.status === 'processing' && <Badge variant="warning">Procesando…</Badge>}
            {d.status === 'ready' && <Badge variant="success">Listo</Badge>}
            {d.status === 'failed' && <Badge variant="destructive">{d.error ?? 'Error'}</Badge>}
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => remove.mutate(d.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentWizard({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Agent | null;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [savedAgentId, setSavedAgentId] = useState<number | null>(null);
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    if (open) {
      setStep(0);
      setSavedAgentId(editing?.id ?? null);
      setDraft(
        editing
          ? {
              name: editing.name,
              purpose: editing.purpose,
              tone: editing.tone ?? '',
              instructions: editing.instructions ?? '',
              business_info: editing.business_info ?? '',
              escalation_rules: editing.escalation_rules ?? '',
              model: editing.model,
              is_default: editing.is_default,
            }
          : EMPTY,
      );
    }
  }, [open, editing]);

  const models = useQuery({
    queryKey: ['or-models'],
    queryFn: () => api.get<{ items: OrModel[] }>('/api/ai/models'),
    enabled: open && step === 3,
    retry: false,
  });

  const filteredModels = useMemo(() => {
    const term = modelSearch.toLowerCase();
    return (models.data?.items ?? []).filter((m) => m.id.toLowerCase().includes(term) || m.name.toLowerCase().includes(term)).slice(0, 30);
  }, [models.data, modelSearch]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // El paso de documentos necesita el agente persistido: se guarda al pasar del paso 1 al 2
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name,
        purpose: draft.purpose,
        tone: draft.tone || null,
        instructions: draft.instructions || null,
        business_info: draft.business_info || null,
        escalation_rules: draft.escalation_rules || null,
        model: draft.model || 'pendiente',
        is_default: draft.is_default,
      };
      if (savedAgentId) return api.patch<Agent>(`/api/agents/${savedAgentId}`, payload);
      return api.post<Agent>('/api/agents', payload);
    },
    onSuccess: (agent) => setSavedAgentId(agent.id),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el agente'),
  });

  const finish = useMutation({
    mutationFn: () =>
      api.patch(`/api/agents/${savedAgentId}`, {
        model: draft.model,
        is_default: draft.is_default || undefined,
      }),
    onSuccess: () => {
      toast.success(editing ? 'Agente actualizado' : 'Agente creado y listo para responder');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo finalizar'),
  });

  const canNext = () => {
    if (step === 0) return draft.name.trim().length > 0 && draft.purpose.trim().length > 0;
    if (step === 3) return draft.model.length > 0;
    return true;
  };

  const next = async () => {
    if (step === 1 && !savedAgentId) {
      const result = await save.mutateAsync();
      if (!result) return;
    }
    if (step === 1 && savedAgentId) await save.mutateAsync();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title={editing ? `Editar agente: ${editing.name}` : 'Crear agente de IA'}
        description="Responde en lenguaje natural; con esto el agente sabrá cómo actuar."
      >
        {/* Pasos */}
        <div className="mb-5 flex items-center gap-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  i < step ? 'bg-accent text-accent-foreground' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn('hidden text-xs sm:block', i === step ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
              {i < STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        <div className="min-h-[300px]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="agent-name">¿Cómo se llama tu agente?</Label>
                <Input
                  id="agent-name"
                  placeholder="Ej. Sofía, asistente de ventas"
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  data-testid="agent-name"
                />
              </div>
              <div>
                <Label htmlFor="agent-purpose">¿Cuál es su propósito? ¿Qué hace tu negocio?</Label>
                <Textarea
                  id="agent-purpose"
                  rows={4}
                  placeholder="Ej. Atiende a clientes interesados en nuestros tours por la Riviera Maya: resuelve dudas de itinerarios y precios, y agenda llamadas con un asesor."
                  value={draft.purpose}
                  onChange={(e) => set({ purpose: e.target.value })}
                  data-testid="agent-purpose"
                />
              </div>
              <div>
                <Label htmlFor="agent-tone">¿Qué tono y personalidad debe tener? (opcional)</Label>
                <Textarea
                  id="agent-tone"
                  rows={2}
                  placeholder="Ej. Cercano y profesional; tutea al cliente; usa máximo un emoji por mensaje."
                  value={draft.tone}
                  onChange={(e) => set({ tone: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="agent-instructions">Reglas de comportamiento (opcional)</Label>
                <Textarea
                  id="agent-instructions"
                  rows={4}
                  placeholder={'Ej.\n- Nunca prometas descuentos sin confirmación de un asesor.\n- Si preguntan por facturación, pide su RFC.\n- Responde máximo en 3 oraciones.'}
                  value={draft.instructions}
                  onChange={(e) => set({ instructions: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="agent-business">Información clave del negocio (opcional)</Label>
                <Textarea
                  id="agent-business"
                  rows={3}
                  placeholder="Ej. Horario: L-V 9:00–18:00. Dirección: ... Métodos de pago: tarjeta, transferencia y efectivo."
                  value={draft.business_info}
                  onChange={(e) => set({ business_info: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="agent-escalation">¿Cuándo debe escalar a un humano? (opcional)</Label>
                <Textarea
                  id="agent-escalation"
                  rows={2}
                  placeholder="Ej. Cuando el cliente pida hablar con una persona, quiera negociar precio o presente una queja."
                  value={draft.escalation_rules}
                  onChange={(e) => set({ escalation_rules: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 2 &&
            (savedAgentId ? (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Sube catálogos, preguntas frecuentes o políticas. El agente extraerá de aquí el contexto para responder
                  con precisión. <span className="text-foreground">Este paso es opcional.</span>
                </p>
                <DocumentsStep agentId={savedAgentId} />
              </div>
            ) : (
              <Spinner />
            ))}

          {step === 3 && (
            <div>
              <Label>Modelo de lenguaje</Label>
              {models.isError ? (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  Configura al menos un proveedor de IA en Ajustes → IA para listar los modelos disponibles. Puedes usar opciones gratuitas como Ollama (local), Groq o Together AI.
                </p>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar modelo… (ej. llama, gemma, mistral, gpt)"
                      className="pl-8"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      data-testid="model-search"
                    />
                  </div>
                  {models.isLoading && <Spinner />}
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {filteredModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => set({ model: m.id })}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                          draft.model === m.id ? 'border-accent bg-accent/8 ring-1 ring-accent' : 'hover:bg-muted',
                        )}
                        data-testid={`model-${m.id}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{m.name}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">{m.id}</p>
                        </div>
                        {draft.model === m.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
                      </button>
                    ))}
                    {filteredModels.length === 0 && models.data && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No se encontraron modelos. Configura un proveedor en Ajustes → IA.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/12 text-accent">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{draft.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{draft.model}</p>
                </div>
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Propósito</dt>
                  <dd>{draft.purpose}</dd>
                </div>
                {draft.tone && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Tono</dt>
                    <dd>{draft.tone}</dd>
                  </div>
                )}
                {draft.escalation_rules && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Escala a humano</dt>
                    <dd>{draft.escalation_rules}</dd>
                  </div>
                )}
              </dl>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.is_default}
                  onChange={(e) => set({ is_default: e.target.checked })}
                  className="h-4 w-4 accent-[hsl(var(--accent))]"
                  data-testid="agent-default-check"
                />
                <span>
                  Hacer <strong>agente por defecto</strong> (responderá automáticamente todos los mensajes entrantes)
                </span>
              </label>
              <FieldHint>El primer agente que crees será el agente por defecto automáticamente.</FieldHint>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}>
            <ChevronLeft className="h-4 w-4" /> {step === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="accent" disabled={!canNext()} loading={save.isPending} onClick={() => void next()} data-testid="wizard-next">
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="accent" loading={finish.isPending} onClick={() => finish.mutate()} data-testid="wizard-finish">
              <Check className="h-4 w-4" /> {editing ? 'Guardar cambios' : 'Crear agente'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
