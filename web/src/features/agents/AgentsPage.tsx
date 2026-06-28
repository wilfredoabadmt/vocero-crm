import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, FileText, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Agent, User } from '@/lib/types';
import { AgentWizard } from './AgentWizard';

export function AgentsPage() {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ items: Agent[] }>('/api/agents') });
  const keyStatus = useQuery({
    queryKey: ['openrouter-key'],
    queryFn: () => api.get<{ configured: boolean; last4: string | null }>('/api/settings/openrouter-key'),
  });

  const makeDefault = useMutation({
    mutationFn: (id: number) => api.post(`/api/agents/${id}/default`),
    onSuccess: () => {
      toast.success('Agente por defecto actualizado');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/agents/${id}`),
    onSuccess: () => {
      toast.success('Agente eliminado');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar'),
  });

  const isAdmin = me?.role === 'admin';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Agentes de IA</h1>
          <p className="text-xs text-muted-foreground">
            Asistentes que contestan tus conversaciones automáticamente vía OpenRouter
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="accent"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setWizardOpen(true);
            }}
            data-testid="new-agent"
          >
            <Plus className="h-4 w-4" /> Crear agente
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {keyStatus.data && !keyStatus.data.configured && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <p className="font-medium text-warning">Falta tu API key de OpenRouter</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Los agentes no podrán responder hasta configurarla en{' '}
              <a href="/ajustes/ia" className="font-medium text-accent underline">
                Ajustes → Inteligencia artificial
              </a>
              .
            </p>
          </div>
        )}

        {agents.isLoading && <Spinner />}

        {agents.data?.items.length === 0 && (
          <EmptyState
            icon={<Bot className="h-5 w-5" />}
            title="Crea tu primer agente de IA"
            description="Un wizard te guiará en lenguaje natural: propósito, tono, reglas y documentos de conocimiento. El primer agente responderá automáticamente los mensajes entrantes."
            action={
              isAdmin ? (
                <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}>
                  <Plus className="h-4 w-4" /> Crear agente
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.data?.items.map((a) => (
            <div key={a.id} className="flex flex-col rounded-lg border bg-card p-4 shadow-sm" data-testid={`agent-card-${a.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{a.name}</h3>
                    <p className="font-mono text-[11px] text-muted-foreground">{a.model}</p>
                  </div>
                </div>
                {a.is_default && (
                  <Badge variant="accent">
                    <Star className="h-3 w-3" /> Por defecto
                  </Badge>
                )}
              </div>

              <p className="mt-3 line-clamp-3 flex-1 text-xs text-muted-foreground">{a.purpose}</p>

              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <FileText className="h-3 w-3" /> {a.documents_count} documento(s)
                </span>
                {isAdmin && (
                  <div className="flex gap-1">
                    {!a.is_default && (
                      <Tooltip label="Hacer agente por defecto">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => makeDefault.mutate(a.id)}>
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip label="Editar">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditing(a);
                          setWizardOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Eliminar">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        onClick={() => {
                          if (confirm(`¿Eliminar el agente "${a.name}"? Sus conversaciones pasarán al agente por defecto.`))
                            remove.mutate(a.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AgentWizard open={wizardOpen} onOpenChange={setWizardOpen} editing={editing} />
    </div>
  );
}
