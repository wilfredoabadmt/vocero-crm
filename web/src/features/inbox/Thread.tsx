import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Check, CheckCheck, Clock, FileText, X } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Avatar, Spinner, Tooltip } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import type { Agent, ConversationSummary, Message } from '@/lib/types';
import { cn, formatDay, formatTime } from '@/lib/utils';
import { Composer } from './Composer';

function StatusTicks({ message }: { message: Message }) {
  if (message.direction !== 'out') return null;
  if (message.status === 'failed') {
    return (
      <Tooltip label={message.failure_reason ?? 'Falló el envío'}>
        <span>
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        </span>
      </Tooltip>
    );
  }
  if (message.status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (message.status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (message.status === 'sent') return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Clock className="h-3 w-3 text-muted-foreground" />;
}

function MediaContent({ message }: { message: Message }) {
  if (!message.media_url) {
    if (['image', 'audio', 'video', 'document', 'sticker'].includes(message.type)) {
      return <p className="text-xs italic text-muted-foreground">Adjunto no disponible</p>;
    }
    return null;
  }
  switch (message.type) {
    case 'image':
    case 'sticker':
      return (
        <a href={message.media_url} target="_blank" rel="noreferrer">
          <img src={message.media_url} alt="Imagen recibida" className="max-h-64 rounded-md object-cover" loading="lazy" />
        </a>
      );
    case 'video':
      return <video src={message.media_url} controls className="max-h-64 rounded-md" />;
    case 'audio':
      return <audio src={message.media_url} controls className="max-w-[240px]" />;
    default:
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md border bg-background/40 px-3 py-2 text-sm hover:bg-background/70"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{message.media_filename ?? 'Documento'}</span>
        </a>
      );
  }
}

function Bubble({ message }: { message: Message }) {
  const isOut = message.direction === 'out';
  return (
    <div className={cn('flex', isOut ? 'justify-end' : 'justify-start')} data-testid={`message-${message.id}`}>
      <div
        className={cn(
          'max-w-[75%] rounded-lg px-3 py-2 shadow-sm animate-fade-in',
          isOut ? 'bg-bubble-out rounded-br-sm' : 'bg-bubble-in border rounded-bl-sm',
        )}
      >
        {isOut && message.author_type === 'ai_agent' && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-accent">
            <Bot className="h-3 w-3" /> {message.author_name ?? 'Agente IA'}
          </div>
        )}
        {isOut && message.author_type === 'user' && message.author_name && (
          <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">{message.author_name}</div>
        )}
        {message.type === 'template' && (
          <Badge variant="outline" className="mb-1">
            Plantilla
          </Badge>
        )}
        <MediaContent message={message} />
        {message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
        {message.type === 'unsupported' && (
          <p className="text-xs italic text-muted-foreground">Tipo de mensaje no soportado</p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {formatTime(message.channel_timestamp ?? message.created_at)}
          <StatusTicks message={message} />
        </div>
      </div>
    </div>
  );
}

export function Thread({ conversation }: { conversation: ConversationSummary }) {
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ['messages', conversation.id],
    queryFn: () => api.get<{ items: Message[]; next_before: number | null }>(`/api/conversations/${conversation.id}/messages`),
  });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ items: Agent[] }>('/api/agents') });

  // Marcar leído al abrir / al llegar mensajes con el hilo abierto
  useEffect(() => {
    if (conversation.unread_count > 0) {
      void api.post(`/api/conversations/${conversation.id}/read`).catch(() => {});
    }
  }, [conversation.id, conversation.unread_count]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [messages.data?.items.length, conversation.id]);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/conversations/${conversation.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const items = messages.data?.items ?? [];
  const defaultAgent = agents.data?.items.find((a) => a.is_default);
  const activeAgentName = conversation.assigned_agent?.name ?? defaultAgent?.name;

  return (
    <>
      {/* Encabezado */}
      <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={conversation.contact.name ?? conversation.contact.wa_id} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{conversation.contact.name ?? conversation.contact.wa_id}</h2>
            <p className="truncate text-xs text-muted-foreground">+{conversation.contact.wa_id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {conversation.needs_human && (
            <Tooltip label={conversation.needs_human_reason ?? 'Requiere atención humana'}>
              <button
                onClick={() => patch.mutate({ needs_human: false })}
                className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning hover:bg-warning/25"
                data-testid="needs-human-badge"
              >
                <AlertTriangle className="h-3 w-3" /> Requiere atención
                <X className="h-3 w-3" />
              </button>
            </Tooltip>
          )}

          {agents.data && agents.data.items.length > 0 && (
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="agent-selector">
                  <Bot className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate">{activeAgentName ?? 'Sin agente'}</span>
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownLabel>Agente IA de esta conversación</DropdownLabel>
                <DropdownItem onSelect={() => patch.mutate({ assigned_agent_id: null })}>
                  Por defecto ({defaultAgent?.name ?? '—'}) {!conversation.assigned_agent && '✓'}
                </DropdownItem>
                {agents.data.items.map((a) => (
                  <DropdownItem key={a.id} onSelect={() => patch.mutate({ assigned_agent_id: a.id })}>
                    {a.name} {conversation.assigned_agent?.id === a.id && '✓'}
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
          )}

          <Tooltip
            label={
              conversation.auto_reply === 'active'
                ? 'La IA responde automáticamente. Se pausa al responder tú.'
                : 'Respuesta automática pausada para esta conversación'
            }
          >
            <div className="flex items-center gap-1.5">
              <Bot className={cn('h-4 w-4', conversation.auto_reply === 'active' ? 'text-accent' : 'text-muted-foreground')} />
              <Switch
                checked={conversation.auto_reply === 'active'}
                onCheckedChange={(on) => patch.mutate({ auto_reply: on ? 'active' : 'paused' })}
                aria-label="Respuesta automática"
                data-testid="auto-reply-toggle"
              />
            </div>
          </Tooltip>
        </div>
      </header>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto bg-background px-4 py-3" data-testid="thread">
        {messages.isLoading && <Spinner />}
        {messages.data?.next_before && (
          <div className="mb-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const older = await api.get<{ items: Message[]; next_before: number | null }>(
                  `/api/conversations/${conversation.id}/messages?before=${messages.data.next_before}`,
                );
                queryClient.setQueryData(['messages', conversation.id], {
                  items: [...older.items, ...items],
                  next_before: older.next_before,
                });
              }}
            >
              Cargar mensajes anteriores
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {items.map((m, i) => {
            const day = formatDay(m.channel_timestamp ?? m.created_at);
            const prevDay = i > 0 ? formatDay(items[i - 1]!.channel_timestamp ?? items[i - 1]!.created_at) : null;
            return (
              <Fragment key={m.id}>
                {day !== prevDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                      {day}
                    </span>
                  </div>
                )}
                <Bubble message={m} />
              </Fragment>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      <Composer conversation={conversation} />
    </>
  );
}
