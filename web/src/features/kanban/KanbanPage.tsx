import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Users, Plus, Trash2, Play, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { TagChip } from '@/components/ui/badge';
import { Avatar, EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { KanbanColumn, KanbanLead } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

function LeadCard({ lead, dragging }: { lead: KanbanLead; dragging?: boolean }) {
  const queryClient = useQueryClient();

  const deleteLead = useMutation({
    mutationFn: () => api.delete(`/api/contacts/${lead.contact_id}`),
    onSuccess: () => {
      toast.success('Lead eliminado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el lead'),
  });

  const simulateActivity = useMutation({
    mutationFn: () => api.post(`/api/contacts/${lead.contact_id}/simulate-activity`, {}),
    onSuccess: (res: any) => {
      toast.info(`Simulación: Lead trasladado a etapa "${res.stage_name}"`);
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo simular la actividad'),
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${lead.name} y todo su historial de chats?`)) {
      deleteLead.mutate();
    }
  };

  const handleSimulate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    simulateActivity.mutate();
  };

  return (
    <div
      className={cn(
        'rounded-md border bg-card p-3 shadow-sm transition-all',
        dragging ? 'rotate-2 shadow-lg ring-2 ring-accent' : 'hover:shadow',
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar name={lead.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="truncate text-sm font-medium">{lead.name}</p>
            {lead.lead_scoring !== null && lead.lead_scoring !== undefined && (
              <span className={cn(
                "text-[8px] font-bold rounded-full px-1.5 py-0.2 border shrink-0",
                lead.lead_scoring >= 70
                  ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40"
                  : lead.lead_scoring >= 35
                  ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40"
                  : "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40"
              )}>
                🔥 {lead.lead_scoring}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{timeAgo(lead.last_message_at)}</p>
        </div>
        
        {/* Acciones de la Tarjeta */}
        <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          <Tooltip label="Simular movimiento (automatización)">
            <button
              onClick={handleSimulate}
              disabled={simulateActivity.isPending}
              className="rounded p-1 text-muted-foreground hover:bg-accent/10 hover:text-accent disabled:opacity-50"
              aria-label="Simular actividad de lead"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          </Tooltip>

          {lead.conversation_id && (
            <Tooltip label="Abrir conversación">
              <Link
                href={`/c/${lead.conversation_id}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Abrir conversación de ${lead.name}`}
              >
                <MessageSquareText className="h-3.5 w-3.5" />
              </Link>
            </Tooltip>
          )}

          <Tooltip label="Eliminar lead">
            <button
              onClick={handleDelete}
              disabled={deleteLead.isPending}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              aria-label="Eliminar lead"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
      {lead.last_message_preview && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{lead.last_message_preview}</p>
      )}
      {lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.map((t) => (
            <TagChip key={t.id} name={t.name} color={t.color} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableLead({ lead }: { lead: KanbanLead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lead-${lead.contact_id}`,
    data: { lead },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab touch-none', isDragging && 'opacity-40')}
      data-testid={`kanban-lead-${lead.contact_id}`}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

function Column({ column }: { column: KanbanColumn }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${column.stage.id}`, data: { stageId: column.stage.id } });
  return (
    <div className="flex w-72 shrink-0 flex-col" data-testid={`kanban-column-${column.stage.position}`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{column.stage.name}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {column.leads.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto rounded-lg border border-dashed bg-muted/40 p-2 transition-colors',
          isOver && 'border-accent bg-accent/10',
        )}
      >
        {column.leads.map((lead) => (
          <DraggableLead key={lead.contact_id} lead={lead} />
        ))}
        {column.leads.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">Arrastra leads aquí</p>
        )}
      </div>
    </div>
  );
}

export function KanbanPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<KanbanLead | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Estado del Modal de Creación
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [waId, setWaId] = useState('');
  const [inboxId, setInboxId] = useState('');

  const kanban = useQuery({
    queryKey: ['kanban'],
    queryFn: () => api.get<{ columns: KanbanColumn[] }>('/api/kanban'),
  });

  const inboxes = useQuery({
    queryKey: ['inboxes'],
    queryFn: () => api.get<{ items: any[] }>('/api/inboxes'),
  });

  const createLead = useMutation({
    pattern: 'mutate',
    mutationFn: () => api.post('/api/contacts', {
      name,
      phone: phone || null,
      waId,
      inboxId: Number(inboxId),
    }),
    onSuccess: () => {
      toast.success('Nuevo lead creado exitosamente');
      setCreateOpen(false);
      setName('');
      setPhone('');
      setWaId('');
      setInboxId('');
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear el lead'),
  } as any);

  const move = useMutation({
    mutationFn: ({ contactId, stageId }: { contactId: number; stageId: number }) =>
      api.patch(`/api/contacts/${contactId}`, { stage_id: stageId }),
    onMutate: async ({ contactId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['kanban'] });
      const previous = queryClient.getQueryData<{ columns: KanbanColumn[] }>(['kanban']);
      if (previous) {
        const lead = previous.columns.flatMap((c) => c.leads).find((l) => l.contact_id === contactId);
        if (lead) {
          queryClient.setQueryData(['kanban'], {
            columns: previous.columns.map((c) => ({
              ...c,
              leads:
                c.stage.id === stageId
                  ? [{ ...lead, stage_id: stageId }, ...c.leads.filter((l) => l.contact_id !== contactId)]
                  : c.leads.filter((l) => l.contact_id !== contactId),
            })),
          });
        }
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['kanban'], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['kanban'] }),
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxId) {
      toast.error('Por favor, selecciona una bandeja de WhatsApp.');
      return;
    }
    createLead.mutate();
  };

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { lead: KanbanLead }).lead);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const lead = (e.active.data.current as { lead: KanbanLead }).lead;
    const stageId = e.over?.data.current?.stageId as number | undefined;
    if (stageId && stageId !== lead.stage_id) move.mutate({ contactId: lead.contact_id, stageId });
  };

  if (kanban.isLoading) return <Spinner className="h-full" />;
  const columns = kanban.data?.columns ?? [];
  const totalLeads = columns.reduce((acc, c) => acc + c.leads.length, 0);

  return (
    <div className="flex h-full flex-col relative">
      <header className="border-b bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Embudo de ventas</h1>
            <p className="text-xs text-muted-foreground">
              {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'} · arrastra las tarjetas para cambiar de etapa o simula su actividad
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} variant="accent" size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Crear Lead
          </Button>
        </div>
      </header>

      {totalLeads === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Sin leads todavía"
          description="Cada contacto que escriba a tu WhatsApp se convertirá en un lead y aparecerá aquí, en la primera etapa."
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-4 overflow-x-auto p-6">
            {columns.map((col) => (
              <Column key={col.stage.id} column={col} />
            ))}
          </div>
          <DragOverlay>{active && <LeadCard lead={active} dragging />}</DragOverlay>
        </DndContext>
      )}

      {/* Modal Dialog de Creación de Lead */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl space-y-4 mx-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="font-bold text-base flex items-center gap-1.5">
                <Users className="h-5 w-5 text-accent" />
                Registrar nuevo Lead
              </h3>
              <button
                onClick={() => setCreateOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre del contacto</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Ej. María López"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono (para mostrar)</Label>
                <Input
                  id="phone"
                  type="text"
                  placeholder="Ej. +52 1 55 1234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="waId">ID de WhatsApp (número sin espacios ni +)</Label>
                <Input
                  id="waId"
                  type="text"
                  placeholder="Ej. 5215512345678"
                  value={waId}
                  onChange={(e) => setWaId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inbox">Bandeja de WhatsApp destino</Label>
                <select
                  id="inbox"
                  value={inboxId}
                  onChange={(e) => setInboxId(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Selecciona una bandeja...</option>
                  {inboxes.data?.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.display_phone_number || 'Sin número'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  className="text-xs"
                  loading={createLead.isPending}
                >
                  Registrar Lead
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
