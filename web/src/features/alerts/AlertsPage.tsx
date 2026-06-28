import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Clock, AlertTriangle, Eye, Trash2, Settings, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { LeadAlert, AlertRule } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { AlertRuleEditor } from './AlertRuleEditor';

const STATUS_LABEL: Record<LeadAlert['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  acknowledged: { label: 'Vista', variant: 'warning', icon: <Eye className="h-3 w-3" /> },
  resolved: { label: 'Resuelta', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  dismissed: { label: 'Descartada', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
};

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const alerts = useQuery({
    queryKey: ['alerts', filter],
    queryFn: () => api.get<{ items: LeadAlert[] }>('/api/alerts'),
  });

  const alertCount = useQuery({
    queryKey: ['alerts-count'],
    queryFn: () => api.get<{ count: number }>('/api/alerts/count'),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/alerts/${id}/acknowledge`),
    onSuccess: () => {
      toast.success('Alerta reconocida');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/alerts/${id}/resolve`),
    onSuccess: () => {
      toast.success('Alerta resuelta');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/alerts/${id}/dismiss`),
    onSuccess: () => {
      toast.success('Alerta descartada');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const filteredAlerts = filter === 'pending'
    ? (alerts.data?.items ?? []).filter((a) => a.status === 'pending')
    : alerts.data?.items ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">Alertas</h1>
            {alertCount.data && alertCount.data.count > 0 && (
              <Badge variant="destructive">{alertCount.data.count}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Notificaciones de leads inactivos y seguimientos pendientes
          </p>
        </div>
        <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setRuleEditorOpen(true)} data-testid="new-alert-rule">
          <Settings className="h-4 w-4" /> Nueva regla
        </Button>
      </header>

      {/* Filtros */}
      <div className="flex gap-2 border-b px-6 py-2">
        {(['pending', 'all'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f === 'pending' ? 'Pendientes' : 'Todas'}
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {alerts.isLoading && <Spinner />}

        {filteredAlerts.length === 0 && (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title={filter === 'pending' ? 'Sin alertas pendientes' : 'Sin alertas'}
            description={
              filter === 'pending'
                ? 'No hay leads inactivos que requieran atención.'
                : 'Crea reglas de alerta para monitorear leads inactivos.'
            }
            action={
              <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setRuleEditorOpen(true)}>
                <Settings className="h-4 w-4" /> Configurar reglas
              </Button>
            }
          />
        )}

        <div className="space-y-2">
          {filteredAlerts.map((alert) => {
            const status = STATUS_LABEL[alert.status];
            const isPending = alert.status === 'pending';

            return (
              <div
                key={alert.id}
                className={`flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md ${
                  isPending ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' : ''
                }`}
                data-testid={`alert-card-${alert.id}`}
              >
                {/* Icono */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isPending ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  <Bell className="h-4 w-4" />
                </div>

                {/* Contenido */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{alert.message}</h3>
                    <Badge variant={status.variant} className="gap-1">
                      {status.icon}
                      {status.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Contacto: {alert.contact_name ?? alert.contact_wa_id}</span>
                    <span>Regla: {alert.rule_name}</span>
                    <span>{timeAgo(alert.created_at)}</span>
                  </div>
                </div>

                {/* Acciones */}
                {isPending && (
                  <div className="flex gap-1">
                    <Tooltip label="Reconocer">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-yellow-600"
                        onClick={() => acknowledgeMutation.mutate(alert.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Resolver">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600"
                        onClick={() => resolveMutation.mutate(alert.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Descartar">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        onClick={() => dismissMutation.mutate(alert.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AlertRuleEditor open={ruleEditorOpen} onOpenChange={setRuleEditorOpen} />
    </div>
  );
}
