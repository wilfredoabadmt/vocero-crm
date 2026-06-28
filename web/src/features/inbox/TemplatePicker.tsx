import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, SendHorizonal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { ConversationSummary, Template } from '@/lib/types';
import { WhatsAppBubblePreview } from '../templates/WhatsAppBubblePreview';

export function TemplatePicker({
  conversation,
  draftText,
}: {
  conversation: ConversationSummary;
  draftText?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [variables, setVariables] = useState<string[]>([]);

  const templates = useQuery({
    queryKey: ['templates', 'selectable', conversation.id],
    queryFn: () => api.get<{ items: Template[] }>(`/api/templates/selectable?conversation_id=${conversation.id}`),
  });

  const selected = useMemo(
    () => templates.data?.items.find((t) => t.id === selectedId) ?? null,
    [templates.data, selectedId],
  );

  const choose = (t: Template) => {
    setSelectedId(t.id);
    // Pre-rellena la primera variable con el borrador del asesor si existe
    setVariables(Array.from({ length: t.variables_count }, (_, i) => (i === 0 && draftText ? draftText : '')));
  };

  const send = useMutation({
    mutationFn: () =>
      api.post(`/api/conversations/${conversation.id}/messages`, {
        type: 'template',
        template_id: selectedId,
        variables,
      }),
    onSuccess: () => {
      setSelectedId(null);
      setVariables([]);
      toast.success('Plantilla enviada');
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar la plantilla'),
  });

  if (templates.isLoading) return null;

  if (!templates.data || templates.data.items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center" data-testid="no-templates">
        <p className="text-sm text-muted-foreground">No tienes plantillas aprobadas para esta bandeja.</p>
        <Link href="/plantillas">
          <Button variant="outline" size="sm" className="mt-2 gap-1.5">
            <LayoutTemplate className="h-3.5 w-3.5" /> Crear una plantilla
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="template-picker">
      <div className="flex flex-wrap gap-2">
        {templates.data.items.map((t) => (
          <button
            key={t.id}
            onClick={() => choose(t)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedId === t.id ? 'border-accent bg-accent/10 text-accent' : 'hover:bg-muted'
            }`}
            data-testid={`template-option-${t.name}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            {Array.from({ length: selected.variables_count }, (_, i) => (
              <div key={i}>
                <Label htmlFor={`var-${i}`}>Variable {`{{${i + 1}}}`}</Label>
                <Input
                  id={`var-${i}`}
                  value={variables[i] ?? ''}
                  placeholder={`Valor para {{${i + 1}}}`}
                  onChange={(e) => {
                    const next = [...variables];
                    next[i] = e.target.value;
                    setVariables(next);
                  }}
                  data-testid={`template-var-${i}`}
                />
              </div>
            ))}
            <Button
              variant="accent"
              size="sm"
              className="gap-1.5"
              disabled={variables.some((v) => !v.trim()) || variables.length !== selected.variables_count}
              loading={send.isPending}
              onClick={() => send.mutate()}
              data-testid="template-send"
            >
              <SendHorizonal className="h-3.5 w-3.5" /> Enviar plantilla
            </Button>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Vista previa</p>
            <WhatsAppBubblePreview body={selected.body} variables={variables} />
          </div>
        </div>
      )}
    </div>
  );
}
