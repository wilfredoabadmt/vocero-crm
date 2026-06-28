import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Inbox as InboxIcon, Plus, RotateCcw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Inbox } from '@/lib/types';

const STATUS: Record<Inbox['status'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  connected: { label: 'Conectada', variant: 'success' },
  pending: { label: 'Esperando onboarding…', variant: 'warning' },
  failed: { label: 'Falló la conexión', variant: 'destructive' },
  disconnected: { label: 'Desconectada', variant: 'outline' },
};

export function InboxesSettings() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');

  const inboxes = useQuery({ queryKey: ['inboxes'], queryFn: () => api.get<{ items: Inbox[] }>('/api/inboxes') });

  const create = useMutation({
    mutationFn: () => api.post<Inbox & { onboarding_url: string }>('/api/inboxes', { name }),
    onSuccess: (inbox) => {
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      setDialogOpen(false);
      setName('');
      // Abre el onboarding del tech provider; el panel detecta la conexión por WebSocket
      window.open(inbox.onboarding_url, '_blank', 'noopener');
      toast.info('Completa el onboarding en la pestaña que se abrió', {
        description: 'Cuando termines, la bandeja aparecerá como conectada aquí automáticamente (1–3 minutos).',
        duration: 10000,
      });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la bandeja'),
  });

  const retry = useMutation({
    mutationFn: (id: number) => api.post<Inbox & { onboarding_url: string }>(`/api/inboxes/${id}/retry`),
    onSuccess: (inbox) => {
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      window.open(inbox.onboarding_url, '_blank', 'noopener');
    },
  });

  const disconnect = useMutation({
    mutationFn: (id: number) => api.post(`/api/inboxes/${id}/disconnect`),
    onSuccess: () => {
      toast.success('Bandeja desconectada');
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Bandejas de WhatsApp</h2>
          <p className="text-xs text-muted-foreground">Conecta los números de tu negocio para recibir y responder mensajes</p>
        </div>
        <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)} data-testid="connect-inbox">
          <Plus className="h-4 w-4" /> Conectar WhatsApp
        </Button>
      </div>

      {inboxes.isLoading && <Spinner />}
      {inboxes.data?.items.length === 0 && (
        <EmptyState
          icon={<InboxIcon className="h-5 w-5" />}
          title="Sin bandejas conectadas"
          description="Conecta tu primer número de WhatsApp. Te llevaremos al asistente de conexión y en menos de 5 minutos estarás recibiendo mensajes aquí."
        />
      )}

      <div className="space-y-3">
        {inboxes.data?.items.map((i) => {
          const status = STATUS[i.status];
          return (
            <div key={i.id} className="flex items-center gap-3 rounded-lg border bg-card p-4" data-testid={`inbox-${i.id}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <InboxIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{i.name}</h3>
                  <Badge variant={status.variant} data-testid={`inbox-status-${i.id}`}>
                    {status.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {i.display_phone_number ?? 'Número pendiente'}
                  {i.last_error && <span className="text-destructive"> · {i.last_error}</span>}
                </p>
              </div>
              <div className="flex gap-1.5">
                {(i.status === 'failed' || i.status === 'disconnected') && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => retry.mutate(i.id)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reintentar
                  </Button>
                )}
                {i.status === 'connected' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 hover:text-destructive"
                    onClick={() => {
                      if (confirm(`¿Desconectar "${i.name}"? Dejarás de recibir mensajes de este número (el historial se conserva).`))
                        disconnect.mutate(i.id);
                    }}
                  >
                    <Unplug className="h-3.5 w-3.5" /> Desconectar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          title="Conectar un número de WhatsApp"
          description="Te redirigiremos al asistente seguro de conexión para vincular tu número."
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="inbox-name">Nombre de la bandeja</Label>
              <Input
                id="inbox-name"
                placeholder="Ej. Ventas, Soporte…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="inbox-name"
              />
              <FieldHint>Solo para identificarla en el panel; puedes cambiarlo después.</FieldHint>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Se abrirá el asistente de conexión en una pestaña nueva.</li>
              <li>Inicia sesión con Facebook y autoriza tu número.</li>
              <li>Vuelve aquí: la bandeja se conectará sola en 1–3 minutos.</li>
            </ol>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="accent" className="gap-1.5" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()} data-testid="inbox-create">
                <ExternalLink className="h-4 w-4" /> Ir al asistente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
