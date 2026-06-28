import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Inbox, Template, User } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { TemplateEditor } from './TemplateEditor';
import { WhatsAppBubblePreview } from './WhatsAppBubblePreview';

const STATUS_LABEL: Record<Template['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Borrador', variant: 'outline' },
  pending: { label: 'En revisión de Meta', variant: 'warning' },
  approved: { label: 'Aprobada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'destructive' },
  disabled: { label: 'Deshabilitada', variant: 'outline' },
};

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);

  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<{ items: Template[] }>('/api/templates') });
  const inboxes = useQuery({ queryKey: ['inboxes'], queryFn: () => api.get<{ items: Inbox[] }>('/api/inboxes') });

  const sync = useMutation({
    mutationFn: (id: number) => api.post(`/api/templates/${id}/sync`),
    onSuccess: () => {
      toast.success('Estado sincronizado con Meta');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo sincronizar'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      toast.success('Plantilla eliminada');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar'),
  });

  const connectedInboxes = inboxes.data?.items.filter((i) => i.status === 'connected') ?? [];
  const inboxName = (id: number) => inboxes.data?.items.find((i) => i.id === id)?.name ?? `Bandeja ${id}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Plantillas de WhatsApp</h1>
          <p className="text-xs text-muted-foreground">
            Mensajes preaprobados por Meta para contactar fuera de la ventana de 24 horas
          </p>
        </div>
        {me?.role === 'admin' && (
          <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setEditorOpen(true)} data-testid="new-template">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {templates.isLoading && <Spinner />}

        {templates.data?.items.length === 0 && (
          <EmptyState
            icon={<LayoutTemplate className="h-5 w-5" />}
            title="Sin plantillas todavía"
            description="Crea tu primera plantilla para poder recontactar leads cuando la ventana de 24 horas esté cerrada. Meta la revisa y aprueba, normalmente en minutos."
            action={
              me?.role === 'admin' ? (
                <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setEditorOpen(true)}>
                  <Plus className="h-4 w-4" /> Crear plantilla
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.data?.items.map((t) => {
            const status = STATUS_LABEL[t.status];
            return (
              <div key={t.id} className="flex flex-col rounded-lg border bg-card p-4 shadow-sm" data-testid={`template-card-${t.name}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-mono text-sm font-semibold">{t.name}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {inboxName(t.inbox_id)} · {t.language.toUpperCase()} · {t.category}
                    </p>
                  </div>
                  <Badge variant={status.variant} data-testid={`template-status-${t.name}`}>{status.label}</Badge>
                </div>

                {t.status === 'rejected' && t.rejection_reason && (
                  <p className="mb-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    Motivo: {t.rejection_reason}
                  </p>
                )}

                <WhatsAppBubblePreview body={t.body} />

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {t.variables_count > 0 ? `${t.variables_count} variable(s)` : 'Sin variables'} · creada {timeAgo(t.created_at)}
                  </span>
                  {me?.role === 'admin' && (
                    <div className="flex gap-1">
                      <Tooltip label="Sincronizar estado con Meta">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sync.mutate(t.id)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Eliminar plantilla">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-destructive"
                          onClick={() => {
                            if (confirm(`¿Eliminar la plantilla "${t.name}"? También se elimina en Meta.`)) remove.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TemplateEditor open={editorOpen} onOpenChange={setEditorOpen} inboxes={connectedInboxes} />
    </div>
  );
}
