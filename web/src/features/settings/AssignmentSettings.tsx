import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Edit, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, FieldHint } from '@/components/ui/input';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import type { AssignmentRule, PanelUser, Stage, Tag, User } from '@/lib/types';

const MODE_LABELS: Record<string, string> = {
  round_robin: 'Round-Robin (secuencial)',
  random: 'Aleatorio',
  least_loaded: 'Menos cargado',
  weighted: 'Ponderado',
  manual: 'Manual',
};

export function AssignmentSettings() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null);

  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;
  const rules = useQuery({ queryKey: ['assignment-rules'], queryFn: () => api.get<{ items: AssignmentRule[] }>('/api/assignments/rules') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ items: PanelUser[] }>('/api/users') });
  const stages = useQuery({ queryKey: ['stages'], queryFn: () => api.get<{ items: Stage[] }>('/api/stages') });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: Tag[] }>('/api/tags') });
  const workloads = useQuery({ queryKey: ['assignment-stats'], queryFn: () => api.get<{ items: Array<{ userId: number; activeLeads: number; name: string }> }>('/api/assignments/stats') });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/api/assignments/rules/${id}`, { is_active: isActive }),
    onSuccess: () => {
      toast.success('Regla actualizada');
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error al actualizar'),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => api.delete(`/api/assignments/rules/${id}`),
    onSuccess: () => {
      toast.success('Regla eliminada');
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error al eliminar'),
  });

  const openEditor = (rule?: AssignmentRule) => {
    setEditingRule(rule ?? null);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Asignación Automática de Leads</h3>
          <p className="text-xs text-muted-foreground">
            Configura reglas para asignar automáticamente nuevos leads a tu equipo
          </p>
        </div>
        {me?.role === 'admin' && (
          <Button variant="accent" size="sm" className="gap-1.5" onClick={() => openEditor()} data-testid="new-assignment-rule">
            <Plus className="h-4 w-4" /> Nueva regla
          </Button>
        )}
      </div>

      {/* Workload Overview */}
      {workloads.data && workloads.data.items.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="mb-3 text-xs font-medium text-muted-foreground">Carga de Trabajo Actual</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {workloads.data.items.map((w) => (
              <div key={w.userId} className="flex items-center justify-between rounded bg-card px-3 py-2 text-sm">
                <span className="truncate">{w.name}</span>
                <Badge variant={w.activeLeads > 10 ? 'destructive' : w.activeLeads > 5 ? 'warning' : 'success'}>
                  {w.activeLeads}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules List */}
      {rules.isLoading && <Spinner />}

      {rules.data?.items.length === 0 && (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Sin reglas de asignación"
          description="Crea reglas para asignar automáticamente los leads que llegan por WhatsApp a tu equipo de ventas."
          action={
            me?.role === 'admin' ? (
              <Button variant="accent" size="sm" className="gap-1.5" onClick={() => openEditor()}>
                <Plus className="h-4 w-4" /> Crear regla
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="space-y-3">
        {rules.data?.items.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between rounded-lg border bg-card p-4" data-testid={`assignment-rule-${rule.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">{rule.name}</h4>
                <Badge variant={rule.is_active ? 'success' : 'outline'}>
                  {rule.is_active ? 'Activa' : 'Inactiva'}
                </Badge>
                <Badge variant="default">{MODE_LABELS[rule.mode]}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {rule.inbox_id && <span>Bandeja: {rule.inbox_id}</span>}
                {rule.filter_stage_id && <span>Etapa: {stages.data?.items.find((s) => s.id === rule.filter_stage_id)?.name}</span>}
                {rule.filter_tag_ids.length > 0 && (
                  <span>
                    Tags: {rule.filter_tag_ids.map((id) => tags.data?.items.find((t) => t.id === id)?.name).join(', ')}
                  </span>
                )}
                {rule.filter_min_score && <span>Score ≥ {rule.filter_min_score}</span>}
                {rule.filter_business_hours && <span>Horario laboral</span>}
                <span>{rule.agents.length} agente(s)</span>
              </div>
            </div>
            {me?.role === 'admin' && (
              <div className="flex items-center gap-1">
                <Tooltip label={rule.is_active ? 'Desactivar' : 'Activar'}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleActive.mutate({ id: rule.id, isActive: !rule.is_active })}
                  >
                    {rule.is_active ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                  </Button>
                </Tooltip>
                <Tooltip label="Editar">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditor(rule)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip label="Eliminar">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:text-destructive"
                    onClick={() => {
                      if (confirm(`¿Eliminar la regla "${rule.name}"?`)) deleteRule.mutate(rule.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        ))}
      </div>

      <AssignmentRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        users={users.data?.items ?? []}
        stages={stages.data?.items ?? []}
        tags={tags.data?.items ?? []}
      />
    </div>
  );
}

interface AssignmentRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AssignmentRule | null;
  users: PanelUser[];
  stages: Stage[];
  tags: Tag[];
}

function AssignmentRuleEditor({ open, onOpenChange, rule, users, stages, tags }: AssignmentRuleEditorProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(rule?.name ?? '');
  const [mode, setMode] = useState<string>(rule?.mode ?? 'round_robin');
  const [priority, setPriority] = useState(rule?.priority ?? 0);
  const [filterStageId, setFilterStageId] = useState<number | null>(rule?.filter_stage_id ?? null);
  const [filterMinScore, setFilterMinScore] = useState<number | null>(rule?.filter_min_score ?? null);
  const [filterBusinessHours, setFilterBusinessHours] = useState(rule?.filter_business_hours ?? false);
  const [selectedAgents, setSelectedAgents] = useState<Array<{ user_id: number; weight: number }>>(
    rule?.agents.map((a) => ({ user_id: a.user_id, weight: a.weight })) ?? []
  );

  const createRule = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/assignments/rules', data),
    onSuccess: () => {
      toast.success('Regla creada');
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error al crear'),
  });

  const updateRule = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/api/assignments/rules/${rule?.id}`, data),
    onSuccess: () => {
      toast.success('Regla actualizada');
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error al actualizar'),
  });

  const toggleAgent = (userId: number) => {
    const exists = selectedAgents.find((a) => a.user_id === userId);
    if (exists) {
      setSelectedAgents(selectedAgents.filter((a) => a.user_id !== userId));
    } else {
      setSelectedAgents([...selectedAgents, { user_id: userId, weight: 1 }]);
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || selectedAgents.length === 0) {
      toast.error('Completa el nombre y selecciona al menos un agente');
      return;
    }

    const data = {
      name: name.trim(),
      mode,
      priority,
      filter_stage_id: filterStageId,
      filter_min_score: filterMinScore,
      filter_business_hours: filterBusinessHours,
      agents: selectedAgents,
    };

    if (rule) {
      updateRule.mutate(data);
    } else {
      createRule.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={rule ? 'Editar Regla' : 'Nueva Regla de Asignación'} wide className="max-w-lg">
        <h2 className="text-lg font-semibold">{rule ? 'Editar Regla' : 'Nueva Regla de Asignación'}</h2>

        <div className="mt-4 space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Round-Robin Principal" data-testid="assignment-rule-name" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Modo de asignación *</Label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} data-testid="assignment-rule-mode" className="rounded-md border bg-background px-3 py-2 text-sm">
                <option value="round_robin">Round-Robin (secuencial)</option>
                <option value="random">Aleatorio</option>
                <option value="least_loaded">Menos cargado</option>
                <option value="weighted">Ponderado</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} min={0} data-testid="assignment-rule-priority" />
              <FieldHint>Mayor prioridad = se evalúa primero</FieldHint>
            </div>
          </div>

          <div>
            <Label>Agentes asignados *</Label>
            <div className="mt-2 space-y-2" data-testid="assignment-rule-agents">
              {users.map((user) => {
                const selected = selectedAgents.find((a) => a.user_id === user.id);
                return (
                  <div key={user.id} className="flex items-center justify-between rounded border p-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={!!selected} onCheckedChange={() => toggleAgent(user.id)} />
                      <span className="text-sm">{user.name}</span>
                    </div>
                    {selected && mode === 'weighted' && (
                      <Input
                        type="number"
                        value={selected.weight}
                        onChange={(e) => {
                          setSelectedAgents(
                            selectedAgents.map((a) =>
                              a.user_id === user.id ? { ...a, weight: Number(e.target.value) || 1 } : a
                            )
                          );
                        }}
                        className="h-7 w-20"
                        min={1}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <h4 className="mb-2 text-xs font-medium">Filtros (opcional)</h4>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Etapa del embudo</Label>
                <select
                  value={filterStageId?.toString() ?? ''}
                  onChange={(e) => setFilterStageId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas las etapas</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Score mínimo</Label>
                <Input
                  type="number"
                  value={filterMinScore ?? ''}
                  onChange={(e) => setFilterMinScore(e.target.value ? Number(e.target.value) : null)}
                  placeholder="1"
                  min={1}
                  max={100}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={filterBusinessHours} onCheckedChange={setFilterBusinessHours} />
                <Label className="text-xs">Solo en horario laboral</Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="accent" onClick={handleSubmit} disabled={createRule.isPending || updateRule.isPending} data-testid="assignment-rule-submit">
              {rule ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
