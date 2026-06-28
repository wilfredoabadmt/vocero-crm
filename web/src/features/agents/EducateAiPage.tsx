import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, FileText, GraduationCap, ShieldCheck, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Agent, AgentDocument } from '@/lib/types';
import { cn } from '@/lib/utils';

export function EducateAiPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'behavior' | 'knowledge' | 'brain'>('behavior');

  // Consulta de agentes para localizar el agente por defecto
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<{ items: Agent[] }>('/api/agents'),
  });

  const defaultAgent = agentsQuery.data?.items.find((a) => a.is_default) ?? agentsQuery.data?.items[0];

  // Formulario de comportamiento
  const [behaviorForm, setBehaviorForm] = useState({
    name: '',
    purpose: '',
    tone: '',
    instructions: '',
    business_info: '',
    escalation_rules: '',
    model: '',
  });

  useEffect(() => {
    if (defaultAgent) {
      setBehaviorForm({
        name: defaultAgent.name || '',
        purpose: defaultAgent.purpose || '',
        tone: defaultAgent.tone || '',
        instructions: defaultAgent.instructions || '',
        business_info: defaultAgent.business_info || '',
        escalation_rules: defaultAgent.escalation_rules || '',
        model: defaultAgent.model || '',
      });
    }
  }, [defaultAgent]);

  // Consulta de documentos de RAG para el agente activo
  const docsQuery = useQuery({
    queryKey: ['agent-docs', defaultAgent?.id],
    queryFn: () => api.get<{ items: AgentDocument[] }>(`/api/agents/${defaultAgent!.id}/documents`),
    enabled: !!defaultAgent?.id,
    refetchInterval: (query) =>
      query.state.data?.items.some((d) => d.status === 'processing') ? 1500 : false,
  });

  // Modelos de IA disponibles
  const modelsQuery = useQuery({
    queryKey: ['or-models'],
    queryFn: () => api.get<{ items: { id: string; name: string; provider: string }[] }>('/api/ai/models'),
  });

  // Mutación para guardar comportamiento/modelo del agente
  const updateAgent = useMutation({
    mutationFn: (payload: Partial<typeof behaviorForm>) =>
      api.patch(`/api/agents/${defaultAgent!.id}`, payload),
    onSuccess: () => {
      toast.success('Entrenamiento y comportamiento del asistente guardados exitosamente');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la configuración'),
  });

  // Mutación para subir archivos de RAG
  const uploadDoc = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/api/agents/${defaultAgent!.id}/documents`, form);
    },
    onSuccess: () => {
      toast.success('Documento de conocimiento subido. Procesando indexación para RAG...');
      queryClient.invalidateQueries({ queryKey: ['agent-docs', defaultAgent?.id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error al subir documento'),
  });

  // Mutación para borrar archivos de RAG
  const deleteDoc = useMutation({
    mutationFn: (docId: number) => api.delete(`/api/documents/${docId}`),
    onSuccess: () => {
      toast.success('Documento removido del conocimiento');
      queryClient.invalidateQueries({ queryKey: ['agent-docs', defaultAgent?.id] });
    },
  });

  // Mutación para crear un agente predeterminado si no existiese ninguno
  const createAgent = useMutation({
    mutationFn: () =>
      api.post<Agent>('/api/agents', {
        name: 'Asistente Comercial',
        purpose: 'Responder preguntas y calificar prospectos en el canal de WhatsApp.',
        model: 'sim/echo-model',
        is_default: true,
      }),
    onSuccess: () => {
      toast.success('Asistente comercial inicializado');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  if (agentsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Si no hay agente, ofrecemos inicializar el predeterminado al instante
  if (!defaultAgent) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b bg-card px-6 py-4">
          <h1 className="text-base font-semibold">Educar a la IA</h1>
          <p className="text-xs text-muted-foreground">Configura el comportamiento y el cerebro de tu asistente comercial</p>
        </header>
        <div className="flex-1 p-6">
          <EmptyState
            icon={<GraduationCap className="h-6 w-6 text-accent" />}
            title="Activa el Asistente de IA"
            description="Para comenzar a educar al chatbot del negocio, primero necesitamos registrar un agente principal en el sistema."
            action={
              <Button variant="accent" loading={createAgent.isPending} onClick={() => createAgent.mutate()}>
                <Sparkles className="mr-2 h-4 w-4" /> Inicializar Asistente
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col border-b bg-card px-6 pt-4">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-1.5">
            <GraduationCap className="h-5 w-5 text-accent animate-pulse" /> Educar a la IA
          </h1>
          <p className="text-xs text-muted-foreground">
            Instruye a tu asistente de WhatsApp sobre el tono de comunicación, tu catálogo comercial y reglas de escalado.
          </p>
        </div>

        {/* Pestañas de Navegación Premium */}
        <div className="mt-4 flex gap-1 border-b">
          <button
            onClick={() => setActiveTab('behavior')}
            className={cn(
              'px-4 py-2 text-xs font-semibold border-b-2 transition-all',
              activeTab === 'behavior'
                ? 'border-accent text-accent bg-accent/6'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Instrucciones y Comportamiento
          </button>
          <button
            onClick={() => setActiveTab('knowledge')}
            className={cn(
              'px-4 py-2 text-xs font-semibold border-b-2 transition-all',
              activeTab === 'knowledge'
                ? 'border-accent text-accent bg-accent/6'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Base de Conocimiento (RAG)
          </button>
          <button
            onClick={() => setActiveTab('brain')}
            className={cn(
              'px-4 py-2 text-xs font-semibold border-b-2 transition-all',
              activeTab === 'brain'
                ? 'border-accent text-accent bg-accent/6'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Cerebro (Modelo de IA)
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Tab 1: Comportamiento */}
        {activeTab === 'behavior' && (
          <div className="max-w-2xl space-y-6">
            <div className="grid gap-4 rounded-lg border bg-card p-5">
              <h3 className="text-sm font-semibold text-accent flex items-center gap-1">
                <Sparkles className="h-4 w-4" /> Personalidad y Rol
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Nombre del Asistente</Label>
                <Input
                  id="agent-name"
                  value={behaviorForm.name}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, name: e.target.value })}
                  placeholder="Ej. Sofía, Asistente de Ventas"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-purpose">Propósito General (El QUÉ hace)</Label>
                <Textarea
                  id="agent-purpose"
                  rows={2}
                  value={behaviorForm.purpose}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, purpose: e.target.value })}
                  placeholder="Ej. Saludar de manera amable, resolver dudas sobre los planes residenciales y agendar visitas guiadas."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-tone">Tono de Voz y Personalidad</Label>
                <Input
                  id="agent-tone"
                  value={behaviorForm.tone}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, tone: e.target.value })}
                  placeholder="Ej. Profesional, empático, entusiasta, usando emoticonos con moderación."
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border bg-card p-5">
              <h3 className="text-sm font-semibold text-accent flex items-center gap-1">
                <Bot className="h-4 w-4" /> Reglas de Operación
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="agent-instructions">Reglas de Comportamiento (Qué NO debe hacer)</Label>
                <Textarea
                  id="agent-instructions"
                  rows={4}
                  value={behaviorForm.instructions}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, instructions: e.target.value })}
                  placeholder="Ej. No des precios de planes personalizados. Nunca compartas datos de contacto personales de los asesores..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-business-info">Información Frecuente del Negocio</Label>
                <Textarea
                  id="agent-business-info"
                  rows={4}
                  value={behaviorForm.business_info}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, business_info: e.target.value })}
                  placeholder="Horarios: Lunes a Viernes de 9am a 6pm. Dirección: Av. Reforma 123. Web: www.crmtoi.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-escalation">Reglas de Escalado a Humanos</Label>
                <Textarea
                  id="agent-escalation"
                  rows={3}
                  value={behaviorForm.escalation_rules}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, escalation_rules: e.target.value })}
                  placeholder="Ej. Si el cliente solicita hablar con un supervisor, solicita la cancelación del servicio o muestra enfado."
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="accent"
                loading={updateAgent.isPending}
                disabled={!behaviorForm.name.trim() || !behaviorForm.purpose.trim()}
                onClick={() => updateAgent.mutate(behaviorForm)}
              >
                Guardar Comportamiento
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Conocimiento RAG */}
        {activeTab === 'knowledge' && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-lg border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Subir material de estudio</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Sube manuales de productos, PDFs de preguntas frecuentes, o archivos de texto. La IA consultará estos fragmentos de forma automática al formular respuestas.
              </p>

              <button
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-muted-foreground transition-all hover:border-accent hover:text-accent bg-accent/2"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) uploadDoc.mutate(file);
                }}
              >
                <UploadCloud className="h-7 w-7 text-accent" />
                <span className="text-xs font-semibold">Arrastra archivos aquí o haz clic para subirlos</span>
                <span className="text-[10px] text-muted-foreground">PDF, TXT, MD o DOCX · Máximo 10 MB</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadDoc.mutate(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Documentos Cargados ({docsQuery.data?.items.length ?? 0})</h3>
              {docsQuery.isLoading && <Spinner />}

              <div className="grid gap-2">
                {docsQuery.data?.items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{d.filename}</p>
                      <p className="text-[10px] text-muted-foreground">{(d.size_bytes / 1024).toFixed(0)} KB</p>
                    </div>
                    <div>
                      {d.status === 'processing' && <Badge variant="warning" className="animate-pulse">Indexando...</Badge>}
                      {d.status === 'ready' && <Badge variant="success">Listo en RAG</Badge>}
                      {d.status === 'failed' && <Badge variant="destructive">Error</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`¿Retirar "${d.filename}" de la memoria del asistente?`)) deleteDoc.mutate(d.id);
                      }}
                      loading={deleteDoc.isPending && deleteDoc.variables === d.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {docsQuery.data?.items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 border rounded-lg bg-card/50">
                    Aún no hay documentos para RAG. ¡Sube un archivo para educar a la IA!
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Cerebro y Modelo */}
        {activeTab === 'brain' && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-lg border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-accent flex items-center gap-1.5">
                <Bot className="h-5 w-5" /> Selecciona el Modelo Activo
              </h3>
              <p className="text-xs text-muted-foreground">
                Elige cuál de tus APIs de LLM configuradas proveerá la inteligencia del bot para las respuestas automáticas de WhatsApp.
              </p>

              <div className="space-y-2">
                <Label htmlFor="model-select">Modelo de Lenguaje</Label>
                {modelsQuery.isLoading ? (
                  <Spinner />
                ) : (
                  <select
                    id="model-select"
                    value={behaviorForm.model}
                    onChange={(e) => setBehaviorForm({ ...behaviorForm, model: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Selecciona un modelo...</option>
                    {modelsQuery.data?.items.map((m) => (
                      <option key={m.id} value={m.id}>
                        [{m.provider.toUpperCase()}] {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <FieldHint>
                  Los modelos se filtran dinámicamente en base a las API Keys que tengas conectadas en la sección de Ajustes → Inteligencia Artificial.
                </FieldHint>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  variant="accent"
                  loading={updateAgent.isPending}
                  disabled={!behaviorForm.model}
                  onClick={() => updateAgent.mutate({ model: behaviorForm.model })}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Asignar Modelo
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
