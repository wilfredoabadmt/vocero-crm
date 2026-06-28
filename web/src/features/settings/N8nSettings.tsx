import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, ExternalLink, HelpCircle, Code, Save, Trash2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldHint } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

export function N8nSettings() {
  const queryClient = useQueryClient();
  const [urlInput, setUrlInput] = useState('');

  const n8nUrlQuery = useQuery({
    queryKey: ['n8n-url'],
    queryFn: () => api.get<{ url: string | null }>('/api/settings/n8n-url'),
  });

  const saveUrl = useMutation({
    mutationFn: (url: string) => api.put('/api/settings/n8n-url', { url }),
    onSuccess: () => {
      toast.success('Configuración de n8n guardada con éxito');
      queryClient.invalidateQueries({ queryKey: ['n8n-url'] });
      setUrlInput('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la URL'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim() && !urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
      toast.error('La URL debe comenzar con http:// o https://');
      return;
    }
    saveUrl.mutate(urlInput.trim());
  };

  const handleDelete = () => {
    saveUrl.mutate('');
  };

  const configuredUrl = n8nUrlQuery.data?.url;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Integración con n8n</h2>
        <p className="text-xs text-muted-foreground">
          Conecta tus workflows y automatizaciones agénticas de n8n directamente con el CRM.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario y Guía */}
        <div className="lg:col-span-1 space-y-6">
          <form onSubmit={handleSave} className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Server className="h-4 w-4 text-accent" />
              Servidor n8n
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="n8n-url">URL de tu panel n8n</Label>
              <div className="flex gap-2">
                <Input
                  id="n8n-url"
                  type="text"
                  placeholder={configuredUrl || "http://localhost:5678"}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1"
                />
              </div>
              <FieldHint>La dirección donde tienes corriendo tu servidor o panel cloud de n8n.</FieldHint>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                variant="accent"
                className="flex-1 text-xs"
                loading={saveUrl.isPending}
                disabled={!urlInput.trim()}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                Guardar URL
              </Button>
              {configuredUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleDelete}
                  aria-label="Eliminar configuración"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>

          {/* Guía instructiva */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5 text-accent" />
              ¿Cómo funciona?
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              1. **Disparador:** Crea una regla en **Ajustes → Automatizaciones**.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              2. **Acción:** Selecciona la acción **Disparar Webhook de n8n** e ingresa la URL de webhook generada por n8n (Production Webhook).
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              3. **Payload:** El CRM enviará automáticamente una petición HTTP POST con el siguiente formato JSON:
            </p>
            <div className="relative rounded bg-muted p-2.5 font-mono text-[10px] text-muted-foreground overflow-x-auto">
              <div className="flex items-center gap-1 text-[9px] font-bold text-accent mb-1">
                <Code className="h-3 w-3" /> PAYLOAD ENVIADO:
              </div>
              {`{
  "event": "lead_stage_changed",
  "rule_name": "Calificar cliente",
  "contact": {
    "id": 14,
    "name": "Carlos Mendoza",
    "phone": "+52...",
    "stage_id": 2,
    "lead_scoring": 85
  },
  "conversation_id": 4
}`}
            </div>
          </div>
        </div>

        {/* Iframe Embebido */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border bg-card p-4 h-[600px] flex flex-col">
            <div className="mb-3 flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Globe className="h-4 w-4 text-emerald-500" />
                Editor de n8n Integrado
              </div>
              {configuredUrl && (
                <a
                  href={configuredUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-accent hover:underline font-medium"
                >
                  Abrir en pestaña nueva
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            
            <div className="flex-1 rounded-md bg-muted/40 border overflow-hidden relative">
              {configuredUrl ? (
                <iframe
                  src={configuredUrl}
                  title="n8n Workflows"
                  className="absolute inset-0 w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Server className="h-12 w-12 text-muted-foreground/30 animate-pulse" />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Editor de n8n no configurado</h4>
                    <p className="text-xs text-muted-foreground max-w-sm mt-1 mx-auto leading-relaxed">
                      Configura la URL de tu servidor de n8n a la izquierda para cargar y diseñar tus flujos de automatizaciones directamente desde este CRM.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
