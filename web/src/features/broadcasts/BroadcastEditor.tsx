import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, FieldHint } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { Inbox, Stage, Tag, Template } from '@/lib/types';
import { SegmentBuilder } from './SegmentBuilder';

interface BroadcastEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inboxes: Inbox[];
  templates: Template[];
}

export function BroadcastEditor({ open, onOpenChange, inboxes, templates }: BroadcastEditorProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [inboxId, setInboxId] = useState<number | null>(inboxes[0]?.id ?? null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [filters, setFilters] = useState<{
    stage_id?: number;
    tag_ids?: number[];
    min_score?: number;
    max_score?: number;
    last_activity_days?: number;
  }>({});

  const stages = useQuery({ queryKey: ['stages'], queryFn: () => api.get<{ items: Stage[] }>('/api/stages') });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: Tag[] }>('/api/tags') });

  const createCampaign = useMutation({
    mutationFn: (data: {
      inbox_id: number;
      name: string;
      template_id: number;
      filter_stage_id?: number;
      filter_tag_ids?: number[];
      filter_min_score?: number;
      filter_max_score?: number;
      filter_last_activity_days?: number;
    }) => api.post('/api/broadcasts', data),
    onSuccess: () => {
      toast.success('Campaña creada');
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la campaña'),
  });

  const resetForm = () => {
    setStep(1);
    setName('');
    setInboxId(inboxes[0]?.id ?? null);
    setTemplateId(null);
    setFilters({});
  };

  const filteredTemplates = templates.filter((t) => !inboxId || t.inbox_id === inboxId);

  const handleSubmit = () => {
    if (!inboxId || !templateId || !name.trim()) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    createCampaign.mutate({
      inbox_id: inboxId,
      name: name.trim(),
      template_id: templateId,
      filter_stage_id: filters.stage_id,
      filter_tag_ids: filters.tag_ids,
      filter_min_score: filters.min_score,
      filter_max_score: filters.max_score,
      filter_last_activity_days: filters.last_activity_days,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nueva Campaña de Difusión" wide className="max-w-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Nueva Campaña de Difusión</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4">
          {/* Progress steps */}
          <div className="mb-6 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    step >= s ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && <div className={`h-0.5 w-12 ${step > s ? 'bg-accent' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Configuración básica */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Configuración básica</h3>

              <div>
                <Label htmlFor="name">Nombre de la campaña *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Promoción de verano"
                  data-testid="broadcast-name"
                />
              </div>

              <div>
                <Label htmlFor="inbox">Bandeja de WhatsApp *</Label>
                <select
                  value={inboxId?.toString() ?? ''}
                  onChange={(e) => {
                    setInboxId(Number(e.target.value));
                    setTemplateId(null);
                  }}
                  data-testid="broadcast-inbox"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar bandeja</option>
                  {inboxes.map((inbox) => (
                    <option key={inbox.id} value={inbox.id}>
                      {inbox.name} ({inbox.display_phone_number ?? inbox.phone_number_id})
                    </option>
                  ))}
                </select>
                <FieldHint>Selecciona la línea de WhatsApp para enviar</FieldHint>
              </div>

              <div>
                <Label htmlFor="template">Plantilla de WhatsApp *</Label>
                <select
                  value={templateId?.toString() ?? ''}
                  onChange={(e) => setTemplateId(Number(e.target.value))}
                  disabled={!inboxId}
                  data-testid="broadcast-template"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar plantilla</option>
                  {filteredTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.language.toUpperCase()})
                    </option>
                  ))}
                </select>
                <FieldHint>Solo aparecen plantillas aprobadas por Meta</FieldHint>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="accent"
                  onClick={() => setStep(2)}
                  disabled={!name.trim() || !inboxId || !templateId}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Segmentación */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Segmentación de audiencia</h3>
              <SegmentBuilder
                stages={stages.data?.items ?? []}
                tags={tags.data?.items ?? []}
                filters={filters}
                onChange={setFilters}
              />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Anterior
                </Button>
                <Button variant="accent" onClick={() => setStep(3)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmación */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Confirmar envío</h3>

              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nombre:</span>{' '}
                    <span className="font-medium">{name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Bandeja:</span>{' '}
                    <span className="font-medium">
                      {inboxes.find((i) => i.id === inboxId)?.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plantilla:</span>{' '}
                    <span className="font-medium">
                      {templates.find((t) => t.id === templateId)?.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Segmentos:</span>{' '}
                    <span className="font-medium">
                      {Object.keys(filters).filter((k) => filters[k as keyof typeof filters] !== undefined).length > 0
                        ? 'Con filtros aplicados'
                        : 'Todos los contactos'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Anterior
                </Button>
                <Button
                  variant="accent"
                  onClick={handleSubmit}
                  disabled={createCampaign.isPending}
                  data-testid="broadcast-submit"
                >
                  {createCampaign.isPending ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" /> Creando...
                    </>
                  ) : (
                    <>
                      <Megaphone className="mr-2 h-4 w-4" /> Crear campaña
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
