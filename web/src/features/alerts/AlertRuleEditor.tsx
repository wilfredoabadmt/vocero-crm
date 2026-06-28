import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

interface AlertRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlertRuleEditor({ open, onOpenChange }: AlertRuleEditorProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('stale_lead');
  const [thresholdHours, setThresholdHours] = useState<number>(24);
  const [messageTemplate, setMessageTemplate] = useState('');

  const users = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get<{ items: User[] }>('/api/users'),
    enabled: open,
  });

  const createRule = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/alert-rules', data),
    onSuccess: () => {
      toast.success('Regla creada');
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error al crear regla'),
  });

  const resetForm = () => {
    setName('');
    setType('stale_lead');
    setThresholdHours(24);
    setMessageTemplate('');
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    createRule.mutate({
      name: name.trim(),
      type,
      threshold_hours: thresholdHours,
      message_template: messageTemplate.trim() || undefined,
      actions: ['notify'],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nueva Regla de Alerta" className="max-w-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Nueva Regla de Alerta</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="rule-name">Nombre *</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Leads inactivos 24h"
              data-testid="rule-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo *</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} data-testid="rule-type" className="rounded-md border bg-background px-3 py-2 text-sm">
                <option value="stale_lead">Lead inactivo</option>
                <option value="no_response">Sin respuesta</option>
                <option value="stage_stuck">Lead estancado</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            <div>
              <Label>Umbral (horas) *</Label>
              <Input
                type="number"
                min={1}
                value={thresholdHours}
                onChange={(e) => setThresholdHours(Number(e.target.value))}
                data-testid="rule-threshold"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="rule-message">Plantilla de mensaje (opcional)</Label>
            <Textarea
              id="rule-message"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Variables: {contact_name}, {threshold_hours}, {last_activity}"
              data-testid="rule-message"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Si se deja vacío, se genera un mensaje automático según el tipo.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={handleSubmit}
              disabled={createRule.isPending}
              data-testid="rule-submit"
            >
              {createRule.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Creando...
                </>
              ) : (
                'Crear regla'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
