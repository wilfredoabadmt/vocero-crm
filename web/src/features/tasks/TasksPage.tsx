import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Calendar, AlertTriangle, Plus, Trash2, Phone, Users, FileText, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner, Tooltip } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Task, User } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { TaskEditor } from './TaskEditor';

const STATUS_LABEL: Record<Task['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: 'En progreso', variant: 'default', icon: <MoreHorizontal className="h-3 w-3" /> },
  completed: { label: 'Completada', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelada', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  overdue: { label: 'Vencida', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
};

const PRIORITY_LABEL: Record<Task['priority'], { label: string; color: string }> = {
  low: { label: 'Baja', color: 'text-gray-500' },
  medium: { label: 'Media', color: 'text-yellow-500' },
  high: { label: 'Alta', color: 'text-orange-500' },
  urgent: { label: 'Urgente', color: 'text-red-500' },
};

const TYPE_LABEL: Record<Task['type'], { label: string; icon: React.ReactNode }> = {
  call: { label: 'Llamada', icon: <Phone className="h-3 w-3" /> },
  meeting: { label: 'Reunión', icon: <Users className="h-3 w-3" /> },
  follow_up: { label: 'Seguimiento', icon: <Clock className="h-3 w-3" /> },
  demo: { label: 'Demo', icon: <FileText className="h-3 w-3" /> },
  proposal: { label: 'Propuesta', icon: <FileText className="h-3 w-3" /> },
  custom: { label: 'Otro', icon: <MoreHorizontal className="h-3 w-3" /> },
};

export function TasksPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const me = queryClient.getQueryData<{ user: User }>(['me'])?.user;

  const tasks = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => {
      const params = filter === 'all' ? '' : `?status=${filter}`;
      return api.get<{ items: Task[] }>(`/api/tasks${params}`);
    },
  });

  const completeTask = useMutation({
    mutationFn: (id: number) => api.post(`/api/tasks/${id}/complete`),
    onSuccess: () => {
      toast.success('Tarea completada');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error al completar'),
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) => api.delete(`/api/tasks/${id}`),
    onSuccess: () => {
      toast.success('Tarea eliminada');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error al eliminar'),
  });

  const isOverdue = (task: Task) => {
    return task.status === 'pending' && new Date(task.due_date) < new Date();
  };

  const sortedTasks = (tasks.data?.items ?? []).sort((a, b) => {
    // Primero las pendientes, luego las vencidas primero
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    if (isOverdue(a) && !isOverdue(b)) return -1;
    if (!isOverdue(a) && isOverdue(b)) return 1;
    // Luego por fecha de vencimiento
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Tareas</h1>
          <p className="text-xs text-muted-foreground">
            Gestiona llamadas, reuniones y seguimientos con tus contactos
          </p>
        </div>
        <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setEditorOpen(true)} data-testid="new-task">
          <Plus className="h-4 w-4" /> Nueva tarea
        </Button>
      </header>

      {/* Filtros */}
      <div className="flex gap-2 border-b px-6 py-2">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendientes' : 'Completadas'}
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tasks.isLoading && <Spinner />}

        {sortedTasks.length === 0 && (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            title={filter === 'completed' ? 'Sin tareas completadas' : 'Sin tareas pendientes'}
            description={
              filter === 'completed'
                ? 'Completa tus primeras tareas para verlas aquí.'
                : 'Crea tu primera tarea para organizar tu día.'
            }
            action={
              filter !== 'completed' ? (
                <Button variant="accent" size="sm" className="gap-1.5" onClick={() => setEditorOpen(true)}>
                  <Plus className="h-4 w-4" /> Crear tarea
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="space-y-2">
          {sortedTasks.map((task) => {
            const status = STATUS_LABEL[isOverdue(task) ? 'overdue' : task.status];
            const priority = PRIORITY_LABEL[task.priority];
            const type = TYPE_LABEL[task.type];
            const isPending = task.status === 'pending' || isOverdue(task);

            return (
              <div
                key={task.id}
                className={`flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md ${
                  isOverdue(task) ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' : ''
                }`}
                data-testid={`task-card-${task.id}`}
              >
                {/* Checkbox */}
                {isPending && (
                  <button
                    onClick={() => completeTask.mutate(task.id)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 transition-colors hover:border-green-500 hover:bg-green-50"
                    data-testid={`task-complete-${task.id}`}
                  >
                    {completeTask.isPending && <Spinner className="h-3 w-3" />}
                  </button>
                )}
                {!isPending && (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                )}

                {/* Contenido */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-medium ${!isPending ? 'text-muted-foreground line-through' : ''}`}>
                      {task.title}
                    </h3>
                    <Badge variant={status.variant} className="gap-1">
                      {status.icon}
                      {status.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {type.icon}
                      {type.label}
                    </span>
                    <span className={`flex items-center gap-1 ${priority.color}`}>
                      Prioridad: {priority.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(task.due_date).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {task.location && (
                      <span className="text-muted-foreground">📍 {task.location}</span>
                    )}
                  </div>
                  {task.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex gap-1">
                  {isPending && (
                    <Tooltip label="Completar tarea">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600"
                        onClick={() => completeTask.mutate(task.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip label="Eliminar">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => {
                        if (confirm('¿Eliminar esta tarea?')) deleteTask.mutate(task.id);
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

      <TaskEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
