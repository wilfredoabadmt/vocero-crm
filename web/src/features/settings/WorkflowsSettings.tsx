import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Bot, Inbox, Mail, Plus, Trash2, Zap, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/misc';

interface Workflow {
  id: number;
  name: string;
  trigger: 'lead_stage_changed' | 'message_created';
  conditions: Record<string, any>;
  actions: Array<{
    type: 'send_whatsapp_template' | 'send_email_mock' | 'assign_agent';
    templateId?: number;
    agentId?: number;
    emailTo?: string;
    emailBody?: string;
  }>;
  isActive: boolean;
}

interface WorkflowLog {
  id: number;
  workflow_id: number;
  workflow_name: string;
  contact_name: string;
  contact_phone: string;
  status: 'success' | 'partial' | 'failed';
  error: string | null;
  executed_at: string;
}

export function WorkflowsSettings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'rules' | 'logs'>('rules');
  const [isCreating, setIsCreating] = useState(false);

  // Formulario local
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<'lead_stage_changed' | 'message_created'>('lead_stage_changed');
  const [stageId, setStageId] = useState<string>('');
  const [actions, setActions] = useState<Workflow['actions']>([]);

  // Consultar datos de backend
  const { data: workflowsData, isLoading: loadingWorkflows } = useQuery<{ items: Workflow[] }>({
    queryKey: ['workflows'],
    queryFn: () => api.get<{ items: Workflow[] }>('/api/workflows'),
  });

  const { data: logsData, isLoading: loadingLogs } = useQuery<{ items: WorkflowLog[] }>({
    queryKey: ['workflow-logs'],
    queryFn: () => api.get<{ items: WorkflowLog[] }>('/api/workflows/logs'),
    refetchInterval: activeTab === 'logs' ? 5000 : undefined,
  });

  const { data: stagesData } = useQuery<{ items: Array<{ id: number; name: string }> }>({
    queryKey: ['stages'],
    queryFn: () => api.get<{ items: Array<{ id: number; name: string }> }>('/api/stages'),
  });

  const { data: agentsData } = useQuery<{ items: Array<{ id: number; name: string }> }>({
    queryKey: ['agents'],
    queryFn: () => api.get<{ items: Array<{ id: number; name: string }> }>('/api/agents'),
  });

  const { data: templatesData } = useQuery<{ items: Array<{ id: number; name: string; status: string }> }>({
    queryKey: ['templates'],
    queryFn: () => api.get<{ items: Array<{ id: number; name: string; status: string }> }>('/api/templates'),
  });

  // Mutaciones
  const createMutation = useMutation({
    mutationFn: (newWorkflow: Omit<Workflow, 'id'>) => api.post<Workflow>('/api/workflows', newWorkflow),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch<Workflow>(`/api/workflows/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/workflows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const resetForm = () => {
    setName('');
    setTrigger('lead_stage_changed');
    setStageId('');
    setActions([]);
    setIsCreating(false);
  };

  const handleAddAction = () => {
    setActions((prev) => [...prev, { type: 'send_whatsapp_template' }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAction = (index: number, fields: Partial<Workflow['actions'][0]>) => {
    setActions((prev) =>
      prev.map((act, i) => (i === index ? { ...act, ...fields } : act))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const conditions: Record<string, any> = {};
    if (trigger === 'lead_stage_changed' && stageId) {
      conditions.stageId = Number(stageId);
    }

    createMutation.mutate({
      name,
      trigger,
      conditions,
      actions,
      isActive: true,
    });
  };

  const approvedTemplates = templatesData?.items?.filter((t) => t.status === 'approved') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Automatización de Flujos</h1>
          <p className="text-xs text-muted-foreground">
            Crea reglas automáticas disparadas por eventos del CRM para ahorrar tiempo operativo.
          </p>
        </div>
        <div className="flex gap-1.5 border rounded-lg p-0.5 bg-muted/40">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'rules' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Reglas activas
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'logs' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Historial de auditoría
          </button>
        </div>
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold">Automatizaciones configuradas</h2>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground px-3 py-1.5 text-xs font-semibold hover:bg-accent/90"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva regla
              </button>
            )}
          </div>

          {/* Formulario de Creación */}
          {isCreating && (
            <form onSubmit={handleSubmit} className="border rounded-xl p-5 bg-card space-y-4 shadow-sm animate-in slide-in-from-top-4 duration-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nueva automatización</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nombre de la regla</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Saludo cliente calificado"
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Evento disparador (Trigger)</label>
                  <select
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value as any)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="lead_stage_changed">Cambio de etapa en Kanban</option>
                    <option value="message_created">Mensaje recibido del cliente</option>
                  </select>
                </div>
              </div>

              {/* Condiciones del disparador */}
              {trigger === 'lead_stage_changed' && (
                <div className="space-y-1 md:w-1/2">
                  <label className="text-xs font-medium text-muted-foreground">Cuando el lead se mueva a la etapa:</label>
                  <select
                    required
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">Selecciona etapa...</option>
                    {stagesData?.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Acciones del flujo */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground">Acciones secuenciales a ejecutar</span>
                  <button
                    type="button"
                    onClick={handleAddAction}
                    className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Agregar acción
                  </button>
                </div>

                {actions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic bg-muted/20 border border-dashed rounded-lg p-4 text-center">
                    No has agregado ninguna acción todavía. Haz clic en "Agregar acción".
                  </p>
                ) : (
                  <div className="space-y-3">
                    {actions.map((action, idx) => (
                      <div key={idx} className="flex gap-3 items-start border rounded-lg p-3 bg-muted/20 relative group">
                        <span className="bg-muted text-muted-foreground font-bold text-xs h-5 w-5 flex items-center justify-center rounded-full shrink-0">
                          {idx + 1}
                        </span>
                        
                        <div className="flex-1 grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Hacer acción</label>
                            <select
                              value={action.type}
                              onChange={(e) => handleUpdateAction(idx, { type: e.target.value as any })}
                              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                            >
                              <option value="send_whatsapp_template">Enviar plantilla WhatsApp</option>
                              <option value="assign_agent">Asignar Agente IA</option>
                              <option value="send_email_mock">Enviar email de auditoría (MOCK)</option>
                            </select>
                          </div>

                          {/* Opciones según tipo */}
                          {action.type === 'send_whatsapp_template' && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Plantilla aprobada</label>
                              <select
                                required
                                value={action.templateId || ''}
                                onChange={(e) => handleUpdateAction(idx, { templateId: Number(e.target.value) })}
                                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                              >
                                <option value="">Selecciona plantilla...</option>
                                {approvedTemplates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {action.type === 'assign_agent' && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Agente IA</label>
                              <select
                                required
                                value={action.agentId || ''}
                                onChange={(e) => handleUpdateAction(idx, { agentId: Number(e.target.value) })}
                                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                              >
                                <option value="">Selecciona agente...</option>
                                {agentsData?.items.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {action.type === 'send_email_mock' && (
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Correo destinatario</label>
                                <input
                                  type="text"
                                  placeholder="Ej. admin@miempresa.com"
                                  value={action.emailTo || ''}
                                  onChange={(e) => handleUpdateAction(idx, { emailTo: e.target.value })}
                                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Asunto / Mensaje</label>
                                <input
                                  type="text"
                                  placeholder="Ej. El lead X ha cambiado de etapa comercial..."
                                  value={action.emailBody || ''}
                                  onChange={(e) => handleUpdateAction(idx, { emailBody: e.target.value })}
                                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveAction(idx)}
                          className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end border-t pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || actions.length === 0}
                  className="rounded-lg bg-accent text-accent-foreground px-3 py-1.5 text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Guardando...' : 'Crear regla'}
                </button>
              </div>
            </form>
          )}

          {/* Listado de Reglas */}
          {loadingWorkflows ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : workflowsData?.items.length === 0 ? (
            <div className="border border-dashed rounded-xl p-10 text-center text-muted-foreground space-y-2">
              <Zap className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">No has configurado ninguna automatización todavía</p>
              <p className="text-xs">Crea tu primera regla para automatizar seguimientos en el Kanban o respuestas.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {workflowsData?.items.map((workflow) => (
                <div key={workflow.id} className="border rounded-xl p-4 bg-card flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{workflow.name}</span>
                      <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
                        workflow.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                      }`}>
                        {workflow.isActive ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ⚡ **Disparador**: {workflow.trigger === 'lead_stage_changed' ? 'Cambio de etapa en Kanban' : 'Mensaje recibido'} 
                      {workflow.conditions.stageId && ` (Etapa ID: ${workflow.conditions.stageId})`}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t">
                      {workflow.actions.map((act, i) => (
                        <span key={i} className="flex items-center gap-1 bg-muted/60 text-[10px] text-muted-foreground rounded-full px-2 py-0.5">
                          {act.type === 'send_whatsapp_template' && <Bot className="h-3 w-3" />}
                          {act.type === 'send_email_mock' && <Mail className="h-3 w-3" />}
                          {act.type === 'assign_agent' && <Bot className="h-3 w-3" />}
                          {act.type === 'send_whatsapp_template' ? 'WhatsApp' : act.type === 'assign_agent' ? 'Asignar IA' : 'Email Mock'}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Switch Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: workflow.id, isActive: !workflow.isActive })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        workflow.isActive ? 'bg-accent' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                          workflow.isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('¿Seguro que deseas eliminar esta automatización?')) {
                          deleteMutation.mutate(workflow.id);
                        }
                      }}
                      className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Registro de ejecuciones recientes</h2>

          {loadingLogs ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : logsData?.items.length === 0 ? (
            <div className="border border-dashed rounded-xl p-10 text-center text-muted-foreground">
              Ninguna regla de automatización se ha ejecutado todavía.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden bg-card">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 font-medium text-muted-foreground">
                    <th className="p-3">Fecha/Hora</th>
                    <th className="p-3">Regla</th>
                    <th className="p-3">Lead afectado</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logsData?.items.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/10">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {new Date(row.executed_at).toLocaleString()}
                      </td>
                      <td className="p-3 font-medium">{row.workflow_name}</td>
                      <td className="p-3">
                        <div className="font-medium">{row.contact_name}</div>
                        <div className="text-[10px] text-muted-foreground">{row.contact_phone}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                          row.status === 'success'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : row.status === 'partial'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-destructive/10 text-destructive'
                        }`}>
                          {row.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : row.status === 'partial' ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {row.status === 'success' ? 'Exitoso' : row.status === 'partial' ? 'Parcial' : 'Fallido'}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.error ? (
                          <span className="text-destructive font-medium">{row.error}</span>
                        ) : (
                          'Ejecución completada con éxito'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
