import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SendHorizonal, Timer, TimerOff, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { ConversationSummary } from '@/lib/types';
import { timeLeft } from '@/lib/utils';
import { TemplatePicker } from './TemplatePicker';

export function Composer({ conversation }: { conversation: ConversationSummary }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [, forceTick] = useState(0);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestReply = async () => {
    setLoadingSuggestion(true);
    try {
      const res = await api.post<{ suggestion: string }>(`/api/conversations/${conversation.id}/suggest-reply`);
      if (res.suggestion) {
        setText(res.suggestion);
        textareaRef.current?.focus();
      } else {
        toast.info('El agente de IA no tiene ninguna sugerencia en este momento o la API no está configurada.');
      }
    } catch {
      toast.error('No se pudo generar la sugerencia de IA');
    } finally {
      setLoadingSuggestion(false);
    }
  };

  // Recalcular la ventana cada 30 s (cuenta regresiva y cierre en vivo)
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const windowOpen = conversation.window.open && conversation.window.expiresAt
    ? new Date(conversation.window.expiresAt).getTime() > Date.now()
    : conversation.window.open;
  const expiresAt = conversation.window.expiresAt;
  const msLeft = expiresAt ? new Date(expiresAt).getTime() - Date.now() : null;
  const closeSoon = windowOpen && msLeft !== null && msLeft < 2 * 3600 * 1000;

  const send = useMutation({
    mutationFn: (body: string) => api.post(`/api/conversations/${conversation.id}/messages`, { type: 'text', body }),
    onSuccess: () => {
      setText('');
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      textareaRef.current?.focus();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'WINDOW_CLOSED') {
        // El texto escrito se conserva; el compositor cambia a modo plantilla
        toast.warning('La ventana de 24 horas se cerró', {
          description: 'Solo puedes contactar a este cliente con una plantilla aprobada. Tu texto quedó guardado.',
        });
        queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      } else {
        toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar el mensaje');
      }
    },
  });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && !send.isPending) send.mutate(text.trim());
    }
  };

  if (!windowOpen) {
    return (
      <div className="border-t bg-card p-3" data-testid="composer-window-closed">
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          <TimerOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-xs">
            <p className="font-semibold text-warning">Ventana de 24 horas cerrada</p>
            <p className="mt-0.5 text-muted-foreground">
              Han pasado más de 24 horas desde el último mensaje del cliente. Por política de WhatsApp, solo puedes
              contactarlo con una <strong>plantilla aprobada</strong>. Si el cliente responde, podrás escribir libremente de nuevo.
            </p>
          </div>
        </div>
        <TemplatePicker conversation={conversation} draftText={text} />
      </div>
    );
  }

  return (
    <div className="border-t bg-card p-3" data-testid="composer">
      <div className="flex items-center justify-between mb-2">
        {closeSoon && expiresAt ? (
          <div className="flex items-center gap-1.5 text-[11px] text-warning">
            <Timer className="h-3 w-3" />
            La ventana de 24 h se cierra en {timeLeft(expiresAt)}
          </div>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={suggestReply}
          disabled={loadingSuggestion}
          className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline disabled:opacity-50 focus:outline-none"
        >
          {loadingSuggestion ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-violet-500 fill-violet-500/10" />
          )}
          Sugerir respuesta con IA
        </button>
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          rows={1}
          placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para salto de línea)"
          className="max-h-40 min-h-[40px] resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          data-testid="composer-input"
        />
        <Button
          variant="accent"
          size="icon"
          aria-label="Enviar mensaje"
          disabled={!text.trim()}
          loading={send.isPending}
          onClick={() => send.mutate(text.trim())}
          data-testid="composer-send"
        >
          {!send.isPending && <SendHorizonal className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
