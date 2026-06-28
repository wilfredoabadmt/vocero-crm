import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { Stage, Tag } from '@/lib/types';

const PALETTE = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#64748b'];

export function TagsStagesSettings() {
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: Tag[] }>('/api/tags') });
  const stages = useQuery({ queryKey: ['stages'], queryFn: () => api.get<{ items: Stage[] }>('/api/stages') });

  const [newTag, setNewTag] = useState({ name: '', color: PALETTE[0]! });
  const [editingStage, setEditingStage] = useState<{ id: number; name: string } | null>(null);
  const [newStageName, setNewStageName] = useState('');

  const createTag = useMutation({
    mutationFn: () => api.post('/api/tags', newTag),
    onSuccess: () => {
      setNewTag({ name: '', color: PALETTE[0]! });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear'),
  });

  const deleteTag = useMutation({
    mutationFn: (id: number) => api.delete(`/api/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const renameStage = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.patch(`/api/stages/${id}`, { name }),
    onSuccess: () => {
      setEditingStage(null);
      toast.success('Etapa renombrada');
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
  });

  const createStage = useMutation({
    mutationFn: (name: string) => api.post('/api/stages', { name }),
    onSuccess: () => {
      setNewStageName('');
      toast.success('Nueva etapa añadida al embudo');
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la etapa'),
  });

  const deleteStage = useMutation({
    mutationFn: (id: number) => api.delete(`/api/stages/${id}`),
    onSuccess: () => {
      toast.success('Etapa eliminada del embudo');
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la etapa'),
  });

  const [localStages, setLocalStages] = useState<Stage[] | null>(null);
  const displayStages = localStages ?? stages.data?.items ?? [];

  const reorderStages = useMutation({
    mutationFn: (ids: number[]) => api.put('/api/stages/reorder', { ids }),
    onSuccess: () => {
      toast.success('Orden de etapas actualizado');
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setLocalStages(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo reordenar las etapas');
      setLocalStages(null);
    },
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    setLocalStages(stages.data?.items ?? []);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const items = [...displayStages];
    const draggedItem = items[draggedIndex]!;
    items.splice(draggedIndex, 1);
    items.splice(index, 0, draggedItem);
    
    setLocalStages(items);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && localStages) {
      reorderStages.mutate(localStages.map((s) => s.id));
    }
    setDraggedIndex(null);
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="text-base font-semibold">Etapas del embudo</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Crea nuevas etapas para tu embudo Kanban o renombra y elimina las existentes de forma dinámica.
        </p>

        {/* Formulario de creación de etapa */}
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="stage-name">Nueva etapa</Label>
            <Input
              id="stage-name"
              placeholder="Ej. Propuesta Enviada..."
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStageName.trim()) createStage.mutate(newStageName.trim());
              }}
            />
          </div>
          <Button
            variant="accent"
            size="icon"
            disabled={!newStageName.trim()}
            onClick={() => createStage.mutate(newStageName.trim())}
            loading={createStage.isPending}
            aria-label="Agregar etapa"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Lista de etapas */}
        <div className="overflow-hidden rounded-lg border bg-card">
          {displayStages.map((s, i) => (
            <div
              key={s.id}
              draggable={editingStage?.id !== s.id}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 p-3 transition-all duration-150 select-none ${i > 0 ? 'border-t' : ''} ${
                editingStage?.id === s.id ? '' : 'cursor-grab active:cursor-grabbing hover:bg-accent/5'
              } ${
                draggedIndex === i ? 'opacity-40 bg-accent/10 border-accent/20 border-dashed' : ''
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0">
                {i + 1}
              </span>
              {editingStage?.id === s.id ? (
                <>
                  <Input
                    className="h-8 flex-1"
                    value={editingStage.name}
                    onChange={(e) => setEditingStage({ id: s.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editingStage.name.trim()) renameStage.mutate(editingStage);
                    }}
                    autoFocus
                    data-testid={`stage-input-${s.position}`}
                  />
                  <Button size="icon" variant="accent" className="h-8 w-8" disabled={!editingStage.name.trim()} onClick={() => renameStage.mutate(editingStage)}>
                    <Check className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{s.name}</span>
                  <div className="flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingStage({ id: s.id, name: s.name })} aria-label={`Renombrar ${s.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-destructive text-muted-foreground"
                      onClick={() => {
                        if (confirm(`¿Eliminar la etapa "${s.name}"? Los contactos de esta etapa deben haberse movido antes.`)) {
                          deleteStage.mutate(s.id);
                        }
                      }}
                      loading={deleteStage.isPending && deleteStage.variables === s.id}
                      aria-label={`Eliminar ${s.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {displayStages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No hay etapas en el embudo.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold">Etiquetas</h2>
        <p className="mb-3 text-xs text-muted-foreground">Para calificar leads: interesado, presupuesto enviado, VIP…</p>

        <div className="mb-3 flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="tag-name">Nueva etiqueta</Label>
            <Input
              id="tag-name"
              placeholder="Nombre…"
              value={newTag.name}
              onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
              data-testid="settings-tag-name"
            />
          </div>
          <div className="flex gap-1 pb-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setNewTag({ ...newTag, color: c })}
                className={`h-6 w-6 rounded-full transition-transform ${newTag.color === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-card' : ''}`}
                style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <Button variant="accent" size="icon" disabled={!newTag.name.trim()} onClick={() => createTag.mutate()} aria-label="Crear etiqueta" data-testid="settings-tag-create">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.data?.items.map((t) => (
            <span
              key={t.id}
              className="group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar la etiqueta "${t.name}"? Se quitará de todos los leads.`)) deleteTag.mutate(t.id);
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Eliminar ${t.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {tags.data?.items.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay etiquetas.</p>}
        </div>
      </div>
    </div>
  );
}
