import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, Clock, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';

interface AgentData {
  userId: number;
  userName: string;
  messageCount: number;
}

interface AgentScorecard {
  totalLeadsAssigned: number;
  leadsConverted: number;
  conversionRate: string;
  messagesHandled: number;
  avgResponseTimeMinutes: number;
}

export function AgentScorecards() {
  const topAgents = useQuery({
    queryKey: ['analytics-top-agents'],
    queryFn: () => api.get<{ items: AgentData[] }>('/api/analytics/top-agents?limit=10'),
    refetchInterval: 30000,
  });

  if (topAgents.isLoading) return <Spinner />;

  const items = topAgents.data?.items ?? [];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-medium">Rendimiento de Agentes</h3>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos de agentes disponibles</p>
      ) : (
        <div className="space-y-3">
          {items.map((agent, index) => (
            <div
              key={agent.userId}
              className="flex items-center justify-between rounded-lg border p-3"
              data-testid={`agent-scorecard-${agent.userId}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-medium text-accent">
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-medium">{agent.userName}</div>
                  <div className="text-xs text-muted-foreground">
                    {agent.messageCount} mensajes enviados
                  </div>
                </div>
              </div>
              <Badge variant={index === 0 ? 'success' : index < 3 ? 'default' : 'outline'}>
                {agent.messageCount}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentDetailScorecard({ userId }: { userId: number }) {
  const scorecard = useQuery({
    queryKey: ['analytics-agent', userId],
    queryFn: () => api.get<{ items: AgentScorecard }>(`/api/analytics/agents/${userId}`),
    refetchInterval: 30000,
  });

  if (scorecard.isLoading) return <Spinner />;

  const data = scorecard.data?.items;

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">No hay datos disponibles para este agente</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium">Detalle del Agente</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            Leads asignados
          </div>
          <div className="mt-1 text-2xl font-bold">{data.totalLeadsAssigned}</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Conversión
          </div>
          <div className="mt-1 text-2xl font-bold text-green-600">{data.conversionRate}%</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            Mensajes
          </div>
          <div className="mt-1 text-2xl font-bold">{data.messagesHandled}</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Tiempo respuesta
          </div>
          <div className="mt-1 text-2xl font-bold">{data.avgResponseTimeMinutes}m</div>
        </div>
      </div>
    </div>
  );
}
