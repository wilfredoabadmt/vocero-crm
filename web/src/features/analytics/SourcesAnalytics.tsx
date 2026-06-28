import { useQuery } from '@tanstack/react-query';
import { PieChart, TrendingUp } from 'lucide-react';
import { Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';

interface SourceData {
  source: string;
  totalLeads: number;
  percentage: string;
}

const SOURCE_LABELS: Record<string, string> = {
  organic: 'Orgánico',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  referral: 'Referido',
  manual: 'Manual',
  webhook: 'Webhook',
  unknown: 'Desconocido',
};

const SOURCE_COLORS: Record<string, string> = {
  organic: 'bg-green-500',
  meta_ads: 'bg-blue-500',
  google_ads: 'bg-yellow-500',
  referral: 'bg-purple-500',
  manual: 'bg-gray-500',
  webhook: 'bg-orange-500',
  unknown: 'bg-gray-400',
};

export function SourcesAnalytics() {
  const sources = useQuery({
    queryKey: ['analytics-sources'],
    queryFn: () => api.get<{ items: SourceData[] }>('/api/analytics/sources'),
    refetchInterval: 30000,
  });

  if (sources.isLoading) return <Spinner />;

  const items = sources.data?.items ?? [];
  const totalLeads = items.reduce((sum, item) => sum + item.totalLeads, 0);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <PieChart className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-medium">Fuentes de Leads</h3>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos disponibles</p>
      ) : (
        <>
          {/* Barra de distribución */}
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted">
            {items.map((item) => (
              <div
                key={item.source}
                className={`${SOURCE_COLORS[item.source] ?? 'bg-gray-400'} transition-all`}
                style={{ width: `${item.percentage}%` }}
                title={`${SOURCE_LABELS[item.source] ?? item.source}: ${item.totalLeads} leads (${item.percentage}%)`}
              />
            ))}
          </div>

          {/* Lista de fuentes */}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.source} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${SOURCE_COLORS[item.source] ?? 'bg-gray-400'}`} />
                  <span>{SOURCE_LABELS[item.source] ?? item.source}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.totalLeads}</span>
                  <span className="text-xs text-muted-foreground">({item.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{totalLeads} leads</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
