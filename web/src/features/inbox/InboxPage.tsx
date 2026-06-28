import { useQuery } from '@tanstack/react-query';
import { Inbox as InboxIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { ConversationSummary } from '@/lib/types';
import { ConversationList } from './ConversationList';
import { ContactPanel } from './ContactPanel';
import { Thread } from './Thread';

export function InboxPage({ conversationId }: { conversationId?: number }) {
  const conversation = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get<ConversationSummary>(`/api/conversations/${conversationId}`),
    enabled: !!conversationId,
  });

  return (
    <div className="flex h-full">
      <div className="flex w-[340px] shrink-0 flex-col border-r bg-card/50">
        <ConversationList selectedId={conversationId} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {conversationId && conversation.data ? (
          <Thread conversation={conversation.data} />
        ) : (
          <EmptyState
            icon={<InboxIcon className="h-5 w-5" />}
            title="Selecciona una conversación"
            description="Elige una conversación de la lista para ver el historial y responder. Los mensajes nuevos aparecen en tiempo real."
          />
        )}
      </div>

      {conversationId && conversation.data && (
        <div className="hidden w-[300px] shrink-0 border-l bg-card/50 xl:block">
          <ContactPanel conversation={conversation.data} />
        </div>
      )}
    </div>
  );
}
