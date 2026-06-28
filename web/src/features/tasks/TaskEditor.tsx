import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Textarea, FieldHint } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskEditor({ open, onOpenChange }: TaskEditorProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('follow_up');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState('');
  const [location, setLocation] = useState('');
  const [contactId, setContactId] = useState<number | null>(null);

  const contacts = useQuery({
    queryKey: ['contacts-search'],
    queryFn: () => api.get<{ items: Array<{ id: number; name: string | null; wa_id: string }> }>('/api/contacts?limit=50'),
    enabled: open,
  });

  const createTask = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/tasks', data),
    onSuccess: () => {
      toast.success('Tarea creada');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error al crear tarea'),
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('follow_up');
    setPriority('medium');
    setDueDate('');
    setLocation('');
    setContactId(null);
  };

  const handleSubmit = () => {
    if (!title.trim() || !dueDate) {
      toast.error('Completa el título y la fecha de vencimiento');
      return;
    }

    createTask.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      priority,
      due_date: new Date(dueDate).toISOString(),
      location: location.trim() || undefined,
      contact_id: contactId || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nueva Tarea" className="max-w-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Nueva Tarea</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="task-title">Título *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Llamar a Carlos para seguimiento"
              data-testid="task-title"
            />
          </div>

          <div>
            <Label htmlFor="task-description">Descripción</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles adicionales..."
              data-testid="task-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo *</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} data-testid="task-type" className="rounded-md border bg-background px-3 py-2 text-sm">
                <option value="call">Llamada</option>
                <option value="meeting">Reunión</option>
                <option value="follow_up">Seguimiento</option>
                <option value="demo">Demo</option>
                <option value="proposal">Propuesta</option>
                <option value="custom">Otro</option>
              </select>
            </div>
            <div>
              <Label>Prioridad *</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="task-priority" className="rounded-md border bg-background px-3 py-2 text-sm">
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="task-due">Fecha y hora de vencimiento *</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="task-due-date"
            />
          </div>

          <div>
            <Label htmlFor="task-contact">Contacto asociado (opcional)</Label>
            <select
              value={contactId?.toString() ?? ''}
              onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : null)}
              data-testid="task-contact"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Sin contacto</option>
              {contacts.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.wa_id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="task-location">Ubicación (opcional)</Label>
            <Input
              id="task-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej: Oficina central, Zoom, etc."
              data-testid="task-location"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={handleSubmit}
              disabled={createTask.isPending}
              data-testid="task-submit"
            >
              {createTask.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Creando...
                </>
              ) : (
                'Crear tarea'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
