import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, X, Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { api, ApiError } from '@/lib/api';
import type { LandingPage } from '@/lib/types';

interface LandingPageEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPage: LandingPage | null;
}

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select';
  required: boolean;
}

export function LandingPageEditor({ open, onOpenChange, editingPage }: LandingPageEditorProps) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [thankYouMessage, setThankYouMessage] = useState('¡Gracias! Nos pondremos en contacto contigo pronto.');
  const [formFields, setFormFields] = useState<FormField[]>([
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Teléfono', type: 'phone', required: false },
  ]);

  useEffect(() => {
    if (editingPage) {
      setSlug(editingPage.slug);
      setTitle(editingPage.title);
      setDescription(editingPage.description ?? '');
      setStatus(editingPage.status);
      setThankYouMessage(editingPage.thank_you_message ?? '');
      const fields = editingPage.form_fields;
      const hasFields = Array.isArray(fields) && fields.length > 0;
      setFormFields(hasFields ? (fields as FormField[]) : [
        { name: 'name', label: 'Nombre', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Teléfono', type: 'phone', required: false },
      ]);
    } else {
      resetForm();
    }
  }, [editingPage]);

  const createPage = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editingPage
        ? api.patch(`/api/landing-pages/${editingPage.id}`, data)
        : api.post('/api/landing-pages', data),
    onSuccess: () => {
      toast.success(editingPage ? 'Landing page actualizada' : 'Landing page creada');
      queryClient.invalidateQueries({ queryKey: ['landing-pages'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const resetForm = () => {
    setSlug('');
    setTitle('');
    setDescription('');
    setStatus('draft');
    setThankYouMessage('¡Gracias! Nos pondremos en contacto contigo pronto.');
    setFormFields([
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Teléfono', type: 'phone', required: false },
    ]);
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const addField = () => {
    setFormFields([...formFields, { name: '', label: '', type: 'text', required: true }]);
  };

  const removeField = (index: number) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = [...formFields];
    newFields[index] = { ...newFields[index], ...updates } as FormField;
    setFormFields(newFields);
  };

  const handleSubmit = () => {
    if (!slug.trim() || !title.trim()) {
      toast.error('El slug y el título son obligatorios');
      return;
    }

    createPage.mutate({
      slug: slug.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      thank_you_message: thankYouMessage.trim() || undefined,
      form_fields: formFields.filter((f) => f.name && f.label),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editingPage ? 'Editar Landing Page' : 'Nueva Landing Page'} className="max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">
              {editingPage ? 'Editar Landing Page' : 'Nueva Landing Page'}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="lp-title">Título *</Label>
              <Input
                id="lp-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!editingPage) setSlug(generateSlug(e.target.value));
                }}
                placeholder="Ej: Landing de Ventas"
                data-testid="lp-title"
              />
            </div>
            <div>
              <Label htmlFor="lp-slug">Slug *</Label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">/lp/</span>
                <Input
                  id="lp-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mi-landing"
                  data-testid="lp-slug"
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="lp-description">Descripción</Label>
            <Textarea
              id="lp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción corta de la página"
              data-testid="lp-description"
            />
          </div>

          <div>
            <Label>Estado</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="lp-status" className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
              <option value="archived">Archivada</option>
            </select>
          </div>

          {/* Campos del formulario */}
          <div>
            <div className="flex items-center justify-between">
              <Label>Campos del formulario</Label>
              <Button variant="outline" size="sm" className="gap-1" onClick={addField}>
                <Plus className="h-3 w-3" /> Agregar campo
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {formFields.map((field, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    value={field.name}
                    onChange={(e) => updateField(index, { name: e.target.value })}
                    placeholder="nombre_campo"
                    className="flex-1"
                  />
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="Etiqueta"
                    className="flex-1"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value as FormField['type'] })}
                    className="w-28 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="text">Texto</option>
                    <option value="email">Email</option>
                    <option value="phone">Teléfono</option>
                    <option value="textarea">Área de texto</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeField(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="lp-thanks">Mensaje de agradecimiento</Label>
            <Textarea
              id="lp-thanks"
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              placeholder="¡Gracias! Nos pondremos en contacto contigo pronto."
              data-testid="lp-thanks"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={handleSubmit}
              disabled={createPage.isPending}
              data-testid="lp-submit"
            >
              {createPage.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Guardando...
                </>
              ) : (
                editingPage ? 'Actualizar' : 'Crear página'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
