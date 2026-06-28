import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Braces, Send } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { FieldHint, Input, Label, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { Inbox } from '@/lib/types';
import { WhatsAppBubblePreview } from './WhatsAppBubblePreview';

const CATEGORIES = [
  { value: 'UTILITY', label: 'Utilidad', hint: 'Seguimientos, confirmaciones, recordatorios (aprobación más fácil)' },
  { value: 'MARKETING', label: 'Marketing', hint: 'Promociones, ofertas y novedades' },
] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

export function TemplateEditor({
  open,
  onOpenChange,
  inboxes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inboxes: Inbox[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [inboxId, setInboxId] = useState<number | null>(null);
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
  const [body, setBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const effectiveInboxId = inboxId ?? inboxes[0]?.id ?? null;

  const variablesCount = useMemo(() => {
    const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    return matches.length ? Math.max(...matches) : 0;
  }, [body]);

  const variablesValid = useMemo(() => {
    const matches = [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    return matches.every((n, i) => n === i + 1);
  }, [body]);

  const insertVariable = () => {
    const next = variablesCount + 1;
    const el = bodyRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? body.length;
    setBody(body.slice(0, pos) + `{{${next}}}` + body.slice(pos));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos + `{{${next}}}`.length, pos + `{{${next}}}`.length);
    });
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/templates', {
        inbox_id: effectiveInboxId,
        name,
        language: 'es',
        category,
        body: body.trim(),
      }),
    onSuccess: () => {
      toast.success('Plantilla enviada a revisión de Meta', {
        description: 'Verás el cambio de estado aquí mismo cuando Meta resuelva.',
      });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      onOpenChange(false);
      setName('');
      setBody('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la plantilla'),
  });

  const canSubmit = !!effectiveInboxId && name.length > 0 && body.trim().length > 0 && variablesValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title="Nueva plantilla de WhatsApp"
        description="Meta revisa cada plantilla antes de poder usarla. Usa variables {{1}}, {{2}}… para personalizar el mensaje."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {inboxes.length === 0 ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                Necesitas una bandeja de WhatsApp conectada para crear plantillas.
              </p>
            ) : (
              <div>
                <Label>Bandeja</Label>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between">
                      {inboxes.find((i) => i.id === effectiveInboxId)?.name ?? 'Selecciona'}
                      <span className="text-muted-foreground">▾</span>
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent className="w-64">
                    {inboxes.map((i) => (
                      <DropdownItem key={i.id} onSelect={() => setInboxId(i.id)}>
                        {i.name} {i.id === effectiveInboxId && '✓'}
                      </DropdownItem>
                    ))}
                  </DropdownContent>
                </Dropdown>
              </div>
            )}

            <div>
              <Label htmlFor="tpl-name">Nombre</Label>
              <Input
                id="tpl-name"
                placeholder="seguimiento_lead"
                value={name}
                onChange={(e) => setName(slugify(e.target.value))}
                data-testid="tpl-name"
              />
              <FieldHint>Solo minúsculas, números y guiones bajos (requisito de Meta)</FieldHint>
            </div>

            <div>
              <Label>Categoría</Label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`rounded-md border p-2.5 text-left transition-colors ${
                      category === c.value ? 'border-accent bg-accent/8 ring-1 ring-accent' : 'hover:bg-muted'
                    }`}
                  >
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{c.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">Mensaje</Label>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={insertVariable}>
                  <Braces className="h-3 w-3" /> Insertar variable
                </Button>
              </div>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                rows={5}
                placeholder={'Hola {{1}}, te escribimos de {{2}}. ¿Sigues interesado en nuestra propuesta?'}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1024}
                data-testid="tpl-body"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {variablesCount > 0 && `${variablesCount} variable(s)`}
                  {!variablesValid && <span className="text-destructive"> · variables no consecutivas</span>}
                </span>
                <span>{body.length}/1024</span>
              </div>
            </div>
          </div>

          <div>
            <Label>Así lo verá tu cliente</Label>
            <WhatsAppBubblePreview body={body || 'Tu mensaje aparecerá aquí…'} />
            <p className="mt-3 text-xs text-muted-foreground">
              Consejo: las plantillas de <strong>Utilidad</strong> con texto claro y variables con propósito evidente se
              aprueban más rápido. Evita lenguaje promocional agresivo en esa categoría.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="accent" className="gap-1.5" disabled={!canSubmit} loading={create.isPending} onClick={() => create.mutate()} data-testid="tpl-submit">
            <Send className="h-4 w-4" /> Enviar a revisión
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
