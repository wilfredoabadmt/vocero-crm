import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, MessageSquare, TrendingUp, Users, Bot, Download } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { SourcesAnalytics } from './SourcesAnalytics';
import { AgentScorecards } from './AgentScorecards';
import { ExportModal } from '@/features/exports/ExportModal';

interface DashboardData {
  leadsByStage: Array<{ id: number; name: string; count: number }>;
  messagesVolume: Array<{ date: string; direction: 'in' | 'out'; count: number }>;
  aiVsHuman: Array<{ authorType: 'contact' | 'user' | 'ai_agent' | 'system'; count: number }>;
  avgResponseTimeSeconds: number;
}

export function DashboardPage() {
  const [exportOpen, setExportOpen] = useState(false);
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get<DashboardData>('/api/analytics/dashboard'),
    refetchInterval: 10_000, // Refrescar automáticamente cada 10s
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <Spinner className="mx-auto mb-4 h-8 w-8 text-accent" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando métricas en tiempo real...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center border rounded-xl p-8 bg-card shadow-sm">
          <BarChart3 className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold mb-2">Error al cargar el panel de control</h2>
          <p className="text-sm text-muted-foreground mb-4">
            No pudimos conectar con los servicios de analíticas. Por favor, asegúrate de que el servidor está corriendo y las migraciones están aplicadas.
          </p>
        </div>
      </div>
    );
  }

  // Calculos de métricas derivadas
  const totalLeads = (data?.leadsByStage || []).reduce((acc, curr) => acc + curr.count, 0);
  
  const totalMessagesIn = (data?.messagesVolume || [])
    .filter((v) => v.direction === 'in')
    .reduce((acc, curr) => acc + curr.count, 0);

  const totalMessagesOut = (data?.messagesVolume || [])
    .filter((v) => v.direction === 'out')
    .reduce((acc, curr) => acc + curr.count, 0);

  const totalMessages = totalMessagesIn + totalMessagesOut;

  const countIA = (data?.aiVsHuman || []).find((h) => h.authorType === 'ai_agent')?.count || 0;
  const countHuman = (data?.aiVsHuman || []).find((h) => h.authorType === 'user')?.count || 0;
  const totalReplies = countIA + countHuman;
  const iaPercentage = totalReplies > 0 ? Math.round((countIA / totalReplies) * 100) : 0;

  // Formateo del tiempo de respuesta
  const formatResponseTime = (seconds: number) => {
    if (seconds === 0) return 'Sin datos';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  };

  // Procesamiento para gráfico de mensajes por día
  const dailyGroups: Record<string, { in: number; out: number }> = {};
  (data?.messagesVolume || []).forEach((v) => {
    if (!dailyGroups[v.date]) {
      dailyGroups[v.date] = { in: 0, out: 0 };
    }
    if (dailyGroups[v.date]) {
      dailyGroups[v.date]![v.direction] += v.count;
    }
  });

  const chartDays = Object.keys(dailyGroups).sort();
  const maxMessagesOnSingleDay = Math.max(
    ...chartDays.map((d) => dailyGroups[d]!.in + dailyGroups[d]!.out),
    10 // Evitar división por cero
  );

  return (
    <div className="h-full overflow-y-auto bg-background p-6 lg:p-8 space-y-8 animate-in fade-in duration-300">
      {/* Cabecera */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Métricas y Rendimiento</h1>
          <p className="text-sm text-muted-foreground">
            Monitoreo en tiempo real del embudo de conversión, efectividad de IA y volúmenes de conversación.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          Actualizado en vivo
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Leads */}
        <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Contactos en Embudo</span>
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-2 text-indigo-500 transition-transform group-hover:scale-110">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">{totalLeads}</span>
            <span className="ml-2 text-xs text-muted-foreground">leads registrados</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />
        </div>

        {/* Total Mensajes */}
        <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Mensajes Totales (7d)</span>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2 text-emerald-500 transition-transform group-hover:scale-110">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{totalMessages}</span>
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" />
              {totalMessagesIn} rec / {totalMessagesOut} env
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        </div>

        {/* Tiempo de Respuesta */}
        <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">T. Promedio de Respuesta</span>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-2 text-amber-500 transition-transform group-hover:scale-110">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">{formatResponseTime(data.avgResponseTimeSeconds)}</span>
            <span className="ml-2 text-xs text-muted-foreground">en chats recientes</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
        </div>

        {/* Tasa IA */}
        <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Tasa de Automatización</span>
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/40 p-2 text-violet-500 transition-transform group-hover:scale-110">
              <Bot className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{iaPercentage}%</span>
            <span className="text-xs text-muted-foreground">
              {countIA} de {totalReplies} respuestas
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
        </div>
      </div>

      {/* Gráficos principales */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gráfico 1: Volumen de Mensajes Diario */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-semibold">Mensajes por Día</h2>
            <p className="text-xs text-muted-foreground">Entrantes vs Salientes de los últimos 7 días</p>
          </div>

          {chartDays.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Sin datos de tráfico en este período.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex h-56 items-end gap-3 pt-6">
                {chartDays.map((date) => {
                  const dayData = dailyGroups[date]!;
                  const total = dayData.in + dayData.out;
                  const inPct = total > 0 ? (dayData.in / maxMessagesOnSingleDay) * 100 : 0;
                  const outPct = total > 0 ? (dayData.out / maxMessagesOnSingleDay) * 100 : 0;
                  
                  // Formatear fecha simple (ej. "27 Jun")
                  const parts = date.split('-');
                  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                  const month = parts[1] ? monthNames[parseInt(parts[1], 10) - 1] : '';
                  const dayLabel = `${parts[2]} ${month}`;

                  return (
                    <div key={date} className="flex-1 flex flex-col items-center h-full group">
                      <div className="flex-1 w-full flex flex-col justify-end gap-1 relative">
                        {/* Tooltip hover */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover border text-popover-foreground text-xs rounded px-2 py-1 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-10 whitespace-nowrap">
                          📥 {dayData.in} | 📤 {dayData.out}
                        </div>

                        {/* Barra Entrante (Verde) */}
                        <div 
                          style={{ height: `${Math.max(inPct, 2)}%` }} 
                          className="w-full bg-emerald-500/80 rounded-t transition-all hover:bg-emerald-500" 
                        />
                        {/* Barra Saliente (Azul) */}
                        <div 
                          style={{ height: `${Math.max(outPct, 2)}%` }} 
                          className="w-full bg-blue-500/80 rounded-t transition-all hover:bg-blue-500" 
                        />
                      </div>
                      <span className="mt-2 text-[10px] text-muted-foreground select-none">
                        {dayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {/* Leyenda */}
              <div className="flex justify-center gap-6 text-xs pt-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-3 w-3 rounded bg-emerald-500" />
                  Entrantes (clientes)
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-3 w-3 rounded bg-blue-500" />
                  Salientes (asesores / IA)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Gráfico 2: Distribución de Leads por Etapas Kanban */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-semibold">Embudo Comercial</h2>
            <p className="text-xs text-muted-foreground">Conversión y distribución actual en el Kanban</p>
          </div>

          <div className="h-64 flex flex-col justify-center space-y-4">
            {data.leadsByStage.map((stage) => {
              const pct = totalLeads > 0 ? Math.round((stage.count / totalLeads) * 100) : 0;
              
              // Paleta de colores degradados por etapa
              const colors = [
                'from-blue-500 to-indigo-500',
                'from-purple-500 to-pink-500',
                'from-amber-500 to-orange-500',
                'from-emerald-500 to-teal-500'
              ];
              const idx = (stage.id - 1) % colors.length;
              const colorGradient = colors[idx] || 'from-slate-500 to-slate-600';

              return (
                <div key={stage.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">{stage.name}</span>
                    <span className="font-semibold">{stage.count} leads <span className="text-xs text-muted-foreground font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full bg-gradient-to-r ${colorGradient} rounded-full transition-all duration-500`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Distribución y efectividad de la Automatización */}
      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold">Rendimiento de los Agentes de IA</h2>
          <p className="text-xs text-muted-foreground">Relación de respuestas automáticas vs intervención humana</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 items-center">
          {/* Gráfico circular o de dona SVG */}
          <div className="flex justify-center md:col-span-1">
            <div className="relative h-32 w-32">
              <svg className="h-full w-full" viewBox="0 0 36 36">
                <path
                  className="text-muted stroke-current"
                  strokeWidth="3.5"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-violet-500 stroke-current"
                  strokeDasharray={`${iaPercentage}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tracking-tight">{iaPercentage}%</span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Auto IA</span>
              </div>
            </div>
          </div>

          {/* Estadísticas de soporte */}
          <div className="md:col-span-2 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground">Respuestas de IA</div>
                <div className="text-xl font-bold text-violet-500 mt-1">{countIA}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">mensajes contestados</div>
              </div>
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground">Respuestas Humanas</div>
                <div className="text-xl font-bold text-blue-500 mt-1">{countHuman}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">asesores comerciales</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground border-t pt-4">
              📌 **Nota**: La IA se pausa automáticamente en cada chat tan pronto como un asesor humano interviene con una respuesta manual, asegurando siempre el control de la calidad y el cierre comercial.
            </div>
          </div>
        </div>
      </div>

      {/* Nuevos componentes de Analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SourcesAnalytics />
        <AgentScorecards />
      </div>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}
