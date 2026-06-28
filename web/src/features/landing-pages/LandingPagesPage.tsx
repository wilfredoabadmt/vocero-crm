import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Eye, Users, ExternalLink, Trash2, Edit, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { LandingPage } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { LandingPageEditor } from './LandingPageEditor';

const STATUS_LABEL: Record<LandingPage['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Borrador', variant: 'outline' },
  published: { label: 'Publicada', variant: 'success' },
  archived: { label: 'Archivada', variant: 'outline' },
};

export function LandingPagesPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null);

  const pages = useQuery({
    queryKey: ['landing-pages'],
    queryFn: () => api.get<{ items: LandingPage[] }>('/api/landing-pages'),
  });

  const deletePage = useMutation({
    mutationFn: (id: number) => api.delete(`/api/landing-pages/${id}`),
    onSuccess: () => {
      toast.success('Landing page eliminada');
      queryClient.invalidateQueries({ queryKey: ['landing-pages'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error al eliminar'),
  });

  const handleEdit = (page: LandingPage) => {
    setEditingPage(page);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setEditingPage(null);
    setEditorOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Landing Pages</h1>
          <p className="text-xs text-muted-foreground">
            Crea páginas de aterrizaje con formularios para capturar leads
          </p>
        </div>
        <Button variant="accent" size="sm" className="gap-1.5" onClick={handleNew} data-testid="new-landing-page">
          <Plus className="h-4 w-4" /> Nueva página
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {pages.isLoading && <Spinner />}

        {pages.data?.items.length === 0 && (
          <EmptyState
            icon={<Globe className="h-5 w-5" />}
            title="Sin landing pages"
            description="Crea tu primera página de aterrizaje para capturar leads."
            action={
              <Button variant="accent" size="sm" className="gap-1.5" onClick={handleNew}>
                <Plus className="h-4 w-4" /> Crear página
              </Button>
            }
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.data?.items.map((page) => {
            const status = STATUS_LABEL[page.status];

            return (
              <div
                key={page.id}
                className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md"
                data-testid={`landing-card-${page.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{page.title}</h3>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate">/{page.slug}</p>
                    {page.description && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{page.description}</p>
                    )}
                  </div>
                </div>

                {/* Estadísticas */}
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {page.view_count} vistas
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {page.submission_count} envíos
                  </span>
                </div>

                {/* Acciones */}
                <div className="mt-4 flex gap-2">
                  {page.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => window.open(`/lp/${page.slug}`, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" /> Ver
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => handleEdit(page)}
                  >
                    <Edit className="h-3 w-3" /> Editar
                  </Button>
                  <Tooltip label="Eliminar">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-destructive"
                      onClick={() => {
                        if (confirm('¿Eliminar esta landing page?')) deletePage.mutate(page.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LandingPageEditor
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingPage(null);
        }}
        editingPage={editingPage}
      />
    </div>
  );
}
