import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Trash2, Send, Clock, Eye } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { BroadcastCampaign, Inbox, Template, User } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { BroadcastEditor } from './BroadcastEditor';
import { BroadcastStats } from './BroadcastStats';

const STATUS_LABEL: Record<BroadcastCampaign['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Borrador', variant: 'outline' },
  scheduled: { label: 'Programada', variant: 'warning' },
  sending: { label: 'Enviando', variant: 'default' },
  completed: { label: 'Completada', variant: 'success' },
  failed: { label: 'Fallida', variant: 'destructive' },
  cancelled: { label: 'Cancelada', variant: 'outline' },
};

export function BroadcastsPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<BroadcastCampaign | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;
  const broadcasts = useQuery({ queryKey: ['broadcasts'], queryFn: () => api.get<{ items: BroadcastCampaign[] }>('/api/broadcasts') });
  const inboxes = useQuery({ queryKey: ['inboxes'], queryFn: () => api.get<{ items: Inbox[] }>('/api/inboxes') });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<{ items: Template[] }>('/api/templates') });

  const sendCampaign = useMutation({
    mutationFn: (id: number) => api.post(`/api/broadcasts/${id}/send`),
    onSuccess: () => {
      toast.success('Campaña en envío');
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar la campaña'),
  });

  const cancelCampaign = useMutation({
    mutationFn: (id: number) => api.post(`/api/broadcasts/${id}/cancel`),
    onSuccess: () => {
      toast.success('Campaña cancelada');
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo cancelar la campaña'),
  });

  const removeCampaign = useMutation({
    mutationFn: (id: number) => api.delete(`/api/broadcasts/${id}`),
    onSuccess: () => {
      toast.success('Campaña eliminada');
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la campaña'),
  });

  const connectedInboxes = inboxes.data?.items.filter((i) => i.status === 'connected') ?? [];
  const approvedTemplates = templates.data?.items.filter((t) => t.status === 'approved') ?? [];
  const inboxName = (id: number) => inboxes.data?.items.find((i) => i.id === id)?.name ?? `Bandeja ${id}`;
  const templateName = (id: number | null) => id ? templates.data?.items.find((t) => t.id === id)?.name ?? `Plantilla ${id}` : 'Sin plantilla';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Campañas de Difusión</h1>
          <p className="text-xs text-muted-foreground">
            Envía mensajes masivos de WhatsApp a tus contactos segmentados
          </p>
        </div>
        {me?.role === 'admin' && (
          <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setEditorOpen(true)} data-testid="new-broadcast">
            <Plus className="h-4 w-4" /> Nueva campaña
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {broadcasts.isLoading && <Spinner />}

        {broadcasts.data?.items.length === 0 && (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="Sin campañas todavía"
            description="Crea tu primera campaña para enviar mensajes masivos de WhatsApp a tus contactos."
            action={
              me?.role === 'admin' ? (
                <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setEditorOpen(true)}>
                  <Plus className="h-4 w-4" /> Crear campaña
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {broadcasts.data?.items.map((campaign) => {
            const status = STATUS_LABEL[campaign.status];
            return (
              <div key={campaign.id} className="flex flex-col rounded-lg border bg-card p-4 shadow-sm" data-testid={`broadcast-card-${campaign.id}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{campaign.name}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {inboxName(campaign.inbox_id)} · {templateName(campaign.template_id)}
                    </p>
                  </div>
                  <Badge variant={status.variant} data-testid={`broadcast-status-${campaign.id}`}>{status.label}</Badge>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted px-2 py-1">
                    <span className="text-muted-foreground">Total:</span>{' '}
                    <span className="font-medium">{campaign.total_recipients}</span>
                  </div>
                  <div className="rounded bg-muted px-2 py-1">
                    <span className="text-muted-foreground">Enviados:</span>{' '}
                    <span className="font-medium text-green-600">{campaign.sent_count}</span>
                  </div>
                  <div className="rounded bg-muted px-2 py-1">
                    <span className="text-muted-foreground">Entregados:</span>{' '}
                    <span className="font-medium text-blue-600">{campaign.delivered_count}</span>
                  </div>
                  <div className="rounded bg-muted px-2 py-1">
                    <span className="text-muted-foreground">Fallidos:</span>{' '}
                    <span className="font-medium text-red-600">{campaign.failed_count}</span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {campaign.status === 'scheduled' && campaign.scheduled_at
                      ? `Programada para ${new Date(campaign.scheduled_at).toLocaleString()}`
                      : `Creada ${timeAgo(campaign.created_at)}`}
                  </span>
                  {me?.role === 'admin' && (
                    <div className="flex gap-1">
                      {campaign.status === 'draft' && (
                        <Tooltip label="Enviar ahora">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              if (confirm(`¿Enviar la campaña "${campaign.name}" ahora?`)) sendCampaign.mutate(campaign.id);
                            }}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                      )}
                      {(campaign.status === 'sending' || campaign.status === 'scheduled') && (
                        <Tooltip label="Cancelar campaña">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => cancelCampaign.mutate(campaign.id)}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip label="Ver estadísticas">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setStatsOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                      {(campaign.status === 'draft' || campaign.status === 'failed' || campaign.status === 'cancelled') && (
                        <Tooltip label="Eliminar campaña">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:text-destructive"
                            onClick={() => {
                              if (confirm(`¿Eliminar la campaña "${campaign.name}"?`)) removeCampaign.mutate(campaign.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BroadcastEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        inboxes={connectedInboxes}
        templates={approvedTemplates}
      />

      {selectedCampaign && (
        <BroadcastStats
          open={statsOpen}
          onOpenChange={setStatsOpen}
          campaign={selectedCampaign}
        />
      )}
    </div>
  );
}
