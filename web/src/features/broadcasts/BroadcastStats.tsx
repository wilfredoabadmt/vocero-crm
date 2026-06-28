import { useQuery } from '@tanstack/react-query';
import { BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { BroadcastCampaign, BroadcastStats as BroadcastStatsType } from '@/lib/types';

interface BroadcastStatsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: BroadcastCampaign;
}

export function BroadcastStats({ open, onOpenChange, campaign }: BroadcastStatsProps) {
  const stats = useQuery({
    queryKey: ['broadcast-stats', campaign.id],
    queryFn: () => api.get<{ stats: BroadcastStatsType }>(`/api/broadcasts/${campaign.id}/recipients?limit=0`),
    enabled: open,
  });

  const statsData = stats.data?.stats ?? {
    total: campaign.total_recipients,
    pending: 0,
    sent: campaign.sent_count,
    delivered: campaign.delivered_count,
    read: campaign.read_count,
    failed: campaign.failed_count,
    replied: campaign.replied_count,
  };

  const rates = {
    delivery_rate: statsData.total > 0 ? ((statsData.delivered / statsData.total) * 100).toFixed(1) : '0',
    read_rate: statsData.total > 0 ? ((statsData.read / statsData.total) * 100).toFixed(1) : '0',
    failure_rate: statsData.total > 0 ? ((statsData.failed / statsData.total) * 100).toFixed(1) : '0',
    reply_rate: statsData.total > 0 ? ((statsData.replied / statsData.total) * 100).toFixed(1) : '0',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Estadísticas de Campaña" wide className="max-w-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Estadísticas de Campaña</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium">{campaign.name}</h3>

          {stats.isLoading ? (
            <Spinner />
          ) : (
            <>
              {/* Progress bar */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progreso de envío</span>
                  <span className="font-medium">
                    {statsData.sent + statsData.failed} / {statsData.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${statsData.total > 0 ? ((statsData.sent + statsData.failed) / statsData.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Stats grid */}
              <div className="mb-6 grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/50 p-3">
                  <div className="text-2xl font-bold">{statsData.total}</div>
                  <div className="text-xs text-muted-foreground">Total destinatarios</div>
                </div>
                <div className="rounded-lg border bg-green-500/10 p-3">
                  <div className="text-2xl font-bold text-green-600">{statsData.sent}</div>
                  <div className="text-xs text-muted-foreground">Enviados</div>
                </div>
                <div className="rounded-lg border bg-blue-500/10 p-3">
                  <div className="text-2xl font-bold text-blue-600">{statsData.delivered}</div>
                  <div className="text-xs text-muted-foreground">Entregados</div>
                </div>
                <div className="rounded-lg border bg-red-500/10 p-3">
                  <div className="text-2xl font-bold text-red-600">{statsData.failed}</div>
                  <div className="text-xs text-muted-foreground">Fallidos</div>
                </div>
              </div>

              {/* Rates */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Tasas de rendimiento</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
                    <span className="text-muted-foreground">Entrega</span>
                    <span className="font-medium">{rates.delivery_rate}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
                    <span className="text-muted-foreground">Lectura</span>
                    <span className="font-medium">{rates.read_rate}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
                    <span className="text-muted-foreground">Fallos</span>
                    <span className="font-medium text-red-600">{rates.failure_rate}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
                    <span className="text-muted-foreground">Respuestas</span>
                    <span className="font-medium text-green-600">{rates.reply_rate}%</span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                {campaign.started_at && (
                  <div className="flex justify-between">
                    <span>Iniciada:</span>
                    <span>{new Date(campaign.started_at).toLocaleString()}</span>
                  </div>
                )}
                {campaign.completed_at && (
                  <div className="flex justify-between">
                    <span>Completada:</span>
                    <span>{new Date(campaign.completed_at).toLocaleString()}</span>
                  </div>
                )}
                {campaign.scheduled_at && (
                  <div className="flex justify-between">
                    <span>Programada para:</span>
                    <span>{new Date(campaign.scheduled_at).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
