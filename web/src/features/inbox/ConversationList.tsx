import { useQuery } from '@tanstack/react-query';
import { Bot, Filter, MessageSquareDashed, Search, TimerOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Badge, TagChip } from '@/components/ui/badge';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Avatar, EmptyState, Skeleton, Tooltip } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { ConversationSummary, Stage, Tag } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

export function ConversationList({ selectedId }: { selectedId?: number }) {
  const [search, setSearch] = useState('');
  const [tagId, setTagId] = useState<number | null>(null);
  const [stageId, setStageId] = useState<number | null>(null);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tagId) params.set('tag_id', String(tagId));
  if (stageId) params.set('stage_id', String(stageId));

  const conversations = useQuery({
    queryKey: ['conversations', search, tagId, stageId],
    queryFn: () => api.get<{ items: ConversationSummary[] }>(`/api/conversations?${params}`),
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: Tag[] }>('/api/tags') });
  const stages = useQuery({ queryKey: ['stages'], queryFn: () => api.get<{ items: Stage[] }>('/api/stages') });

  const activeFilters = (tagId ? 1 : 0) + (stageId ? 1 : 0);

  return (
    <>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar conversación…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar conversación"
          />
        </div>
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Filtros" className="relative">
              <Filter className="h-4 w-4" />
              {activeFilters > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
                  {activeFilters}
                </span>
              )}
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownLabel>Etiqueta</DropdownLabel>
            <DropdownItem onSelect={() => setTagId(null)}>Todas {tagId === null && '✓'}</DropdownItem>
            {tags.data?.items.map((t) => (
              <DropdownItem key={t.id} onSelect={() => setTagId(t.id)}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name} {tagId === t.id && '✓'}
              </DropdownItem>
            ))}
            <DropdownSeparator />
            <DropdownLabel>Etapa</DropdownLabel>
            <DropdownItem onSelect={() => setStageId(null)}>Todas {stageId === null && '✓'}</DropdownItem>
            {stages.data?.items.map((s) => (
              <DropdownItem key={s.id} onSelect={() => setStageId(s.id)}>
                {s.name} {stageId === s.id && '✓'}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.isLoading && (
          <div className="space-y-2 p-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}

        {conversations.data?.items.length === 0 && (
          <EmptyState
            icon={<MessageSquareDashed className="h-5 w-5" />}
            title={search || activeFilters ? 'Sin resultados' : 'Aún no hay conversaciones'}
            description={
              search || activeFilters
                ? 'Prueba con otra búsqueda u otros filtros.'
                : 'Cuando un cliente escriba a tu WhatsApp conectado, la conversación aparecerá aquí al instante.'
            }
          />
        )}

        {conversations.data?.items.map((c) => (
          <Link
            key={c.id}
            href={`/c/${c.id}`}
            className={cn(
              'flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60',
              selectedId === c.id && 'bg-accent/8 border-l-2 border-l-accent',
            )}
            data-testid={`conversation-item-${c.id}`}
          >
            <Avatar name={c.contact.name ?? c.contact.wa_id} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn('truncate text-sm', c.unread_count > 0 ? 'font-semibold' : 'font-medium')}>
                  {c.contact.name ?? c.contact.wa_id}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.last_message_at)}</span>
              </div>
              <p
                className={cn(
                  'mt-0.5 truncate text-xs',
                  c.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {c.last_message_preview ?? 'Sin mensajes'}
              </p>
              <div className="mt-1 flex items-center gap-1">
                {!c.window.open && (
                  <Tooltip label="Ventana de 24 h cerrada: solo plantillas">
                    <span>
                      <TimerOff className="h-3 w-3 text-warning" />
                    </span>
                  </Tooltip>
                )}
                {c.auto_reply === 'active' && (
                  <Tooltip label="Respuesta automática activa">
                    <span>
                      <Bot className="h-3 w-3 text-accent" />
                    </span>
                  </Tooltip>
                )}
                {c.needs_human && <Badge variant="warning">Requiere atención</Badge>}
                {c.contact.lead_scoring !== null && c.contact.lead_scoring !== undefined && (
                  <Tooltip label={`Interés del lead: ${c.contact.lead_scoring}/100`}>
                    <span className={cn(
                      "text-[9px] font-bold rounded-full px-1.5 py-0.5 border flex items-center gap-0.5 shrink-0",
                      c.contact.lead_scoring >= 70
                        ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40"
                        : c.contact.lead_scoring >= 35
                        ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40"
                        : "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40"
                    )}>
                      🔥 {c.contact.lead_scoring}
                    </span>
                  </Tooltip>
                )}
                {c.tags.slice(0, 2).map((t) => (
                  <TagChip key={t.id} name={t.name} color={t.color} />
                ))}
              </div>
            </div>
            {c.unread_count > 0 && (
              <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                {c.unread_count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
