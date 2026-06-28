import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { TagChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { ConversationSummary, Note, Stage, Tag, User } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

export function ContactPanel({ conversation }: { conversation: ConversationSummary }) {
  const queryClient = useQueryClient();
  const contact = conversation.contact;
  const [noteText, setNoteText] = useState('');
  const [newTagName, setNewTagName] = useState('');

  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;
  const stages = useQuery({ queryKey: ['stages'], queryFn: () => api.get<{ items: Stage[] }>('/api/stages') });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: Tag[] }>('/api/tags') });
  const notes = useQuery({
    queryKey: ['notes', conversation.id],
    queryFn: () => api.get<{ items: Note[] }>(`/api/conversations/${conversation.id}/notes`),
  });

  const invalidateContact = () => {
    queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['kanban'] });
  };

  const setStage = useMutation({
    mutationFn: (stage_id: number) => api.patch(`/api/contacts/${contact.id}`, { stage_id }),
    onSuccess: invalidateContact,
  });

  const setTags = useMutation({
    mutationFn: (tag_ids: number[]) => api.put(`/api/contacts/${contact.id}/tags`, { tag_ids }),
    onSuccess: () => {
      invalidateContact();
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const createTag = useMutation({
    mutationFn: (name: string) =>
      api.post<Tag>('/api/tags', { name, color: ['#0d9488', '#7c3aed', '#db2777', '#ea580c', '#2563eb'][name.length % 5] }),
    onSuccess: (tag) => {
      setNewTagName('');
      setTags.mutate([...conversation.tags.map((t) => t.id), tag.id]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la etiqueta'),
  });

  const addNote = useMutation({
    mutationFn: () => api.post(`/api/conversations/${conversation.id}/notes`, { body: noteText.trim() }),
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['notes', conversation.id] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: number) => api.delete(`/api/notes/${noteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', conversation.id] }),
  });

  const currentStage = stages.data?.items.find((s) => s.id === contact.stage_id);
  const assignedTagIds = new Set(conversation.tags.map((t) => t.id));

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4" data-testid="contact-panel">
      <div className="flex flex-col items-center gap-2 border-b pb-4 text-center">
        <Avatar name={contact.name ?? contact.wa_id} size="lg" />
        <div>
          <h3 className="text-sm font-semibold">{contact.name ?? contact.wa_id}</h3>
          <p className="text-xs text-muted-foreground">+{contact.wa_id}</p>
        </div>
      </div>

      {/* Etapa del embudo */}
      <div className="border-b py-4">
        <Label>Etapa del embudo</Label>
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between" data-testid="stage-selector">
              {currentStage?.name ?? '—'}
              <span className="text-muted-foreground">▾</span>
            </Button>
          </DropdownTrigger>
          <DropdownContent className="w-56">
            {stages.data?.items.map((s) => (
              <DropdownItem key={s.id} onSelect={() => setStage.mutate(s.id)}>
                {s.position}. {s.name} {s.id === contact.stage_id && '✓'}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      </div>

      {/* Etiquetas */}
      <div className="border-b py-4">
        <Label>Etiquetas</Label>
        <div className="flex flex-wrap gap-1.5" data-testid="contact-tags">
          {conversation.tags.map((t) => (
            <TagChip
              key={t.id}
              name={t.name}
              color={t.color}
              onRemove={() => setTags.mutate(conversation.tags.filter((x) => x.id !== t.id).map((x) => x.id))}
            />
          ))}
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-accent hover:text-accent"
                data-testid="add-tag"
              >
                <Plus className="h-3 w-3" /> Etiqueta
              </button>
            </DropdownTrigger>
            <DropdownContent className="w-56">
              {tags.data?.items
                .filter((t) => !assignedTagIds.has(t.id))
                .map((t) => (
                  <DropdownItem
                    key={t.id}
                    onSelect={() => setTags.mutate([...conversation.tags.map((x) => x.id), t.id])}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </DropdownItem>
                ))}
              <DropdownSeparator />
              <div className="flex gap-1 p-1" onKeyDown={(e) => e.stopPropagation()}>
                <Input
                  placeholder="Nueva etiqueta…"
                  className="h-7 text-xs"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagName.trim()) createTag.mutate(newTagName.trim());
                  }}
                  data-testid="new-tag-input"
                />
                <Button
                  size="sm"
                  variant="accent"
                  className="h-7 px-2"
                  disabled={!newTagName.trim()}
                  onClick={() => createTag.mutate(newTagName.trim())}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      {/* Notas internas */}
      <div className="flex-1 py-4">
        <Label className="flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5" /> Notas internas
        </Label>
        <p className="mb-2 text-[11px] text-muted-foreground">Solo visibles para tu equipo; nunca se envían al cliente.</p>
        <div className="flex gap-1.5">
          <Textarea
            rows={2}
            placeholder="Escribe una nota…"
            className="min-h-[56px] text-xs"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            data-testid="note-input"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-1.5 w-full"
          disabled={!noteText.trim()}
          loading={addNote.isPending}
          onClick={() => addNote.mutate()}
          data-testid="note-save"
        >
          Guardar nota
        </Button>

        <div className="mt-3 space-y-2" data-testid="notes-list">
          {notes.data?.items.map((n) => (
            <div key={n.id} className="group rounded-md border bg-card p-2.5">
              <p className="whitespace-pre-wrap text-xs">{n.body}</p>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {n.author} · {timeAgo(n.created_at)}
                </span>
                {(me?.role === 'admin' || me?.id === n.author_id) && (
                  <button
                    onClick={() => deleteNote.mutate(n.id)}
                    className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Borrar nota"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {notes.data?.items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">Sin notas todavía</p>
          )}
        </div>
      </div>
    </div>
  );
}
