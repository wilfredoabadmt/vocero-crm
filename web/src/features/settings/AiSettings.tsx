import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, Trash2, Cpu, Globe, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';

interface KeyConfig {
  configured: boolean;
  last4: string | null;
}

type ProviderId = 'openai' | 'gemini' | 'zhipu' | 'openrouter' | 'ollama' | 'groq' | 'together' | 'huggingface' | 'mistral' | 'opencode';
type KeyStatusResponse = Record<ProviderId, KeyConfig>;

const providersList = [
  {
    id: 'ollama' as ProviderId,
    name: 'Ollama (Local / Gratis)',
    placeholder: 'http://localhost:11434 (o deja vacío)',
    hint: '100% gratis y local. Instala Ollama en tu PC o servidor, ejecuta "ollama pull llama3.1:8b" y no necesitas API key.',
    icon: Cpu,
    isFree: true,
  },
  {
    id: 'opencode' as ProviderId,
    name: 'OpenCode (Local / Gratis)',
    placeholder: 'http://localhost:4010 (o deja vacío)',
    hint: 'Consíguelo ejecutando "opencode" en tu PC. Escucha por defecto en http://localhost:4010 y expone modelos libres compatibles con la API de OpenAI.',
    icon: Cpu,
    isFree: true,
  },
  {
    id: 'groq' as ProviderId,
    name: 'Groq (Free tier ultrarrápido)',
    placeholder: 'gsk_...',
    hint: 'Consíguela gratis en console.groq.com. Velocidad extrema sin costo. Modelos: Llama 3, Gemma 2, Mixtral.',
    icon: Zap,
    isFree: true,
  },
  {
    id: 'together' as ProviderId,
    name: 'Together AI (Free tier)',
    placeholder: 'tok_...',
    hint: 'Consíguela gratis en api.together.xyz. Modelos: Llama 3.1, Mixtral, Gemma 2. Tier gratuito generoso.',
    icon: Globe,
    isFree: true,
  },
  {
    id: 'huggingface' as ProviderId,
    name: 'Hugging Face (Gratis)',
    placeholder: 'hf_...',
    hint: 'Consíguela gratis en huggingface.co/settings/tokens. Miles de modelos open-source con inferencia gratuita.',
    icon: Globe,
    isFree: true,
  },
  {
    id: 'mistral' as ProviderId,
    name: 'Mistral AI (Free tier)',
    placeholder: '...',
    hint: 'Consíguela en console.mistral.ai. Modelos: Mistral Tiny, Small, Nemo. Free tier disponible.',
    icon: Zap,
    isFree: true,
  },
  {
    id: 'openrouter' as ProviderId,
    name: 'OpenRouter (Universal)',
    placeholder: 'sk-or-v1-...',
    hint: 'Consíguela en openrouter.ai. Acceso a cientos de modelos incluyendo muchos gratuitos.',
    icon: Globe,
  },
  {
    id: 'openai' as ProviderId,
    name: 'OpenAI (ChatGPT)',
    placeholder: 'sk-proj-...',
    hint: 'Consíguela en platform.openai.com. Modelos GPT-4o, GPT-3.5 Turbo.',
    icon: KeyRound,
  },
  {
    id: 'gemini' as ProviderId,
    name: 'Google Gemini',
    placeholder: 'AIzaSy...',
    hint: 'Consíguela en aistudio.google.com. Modelos Gemini 1.5 Pro/Flash.',
    icon: KeyRound,
  },
  {
    id: 'zhipu' as ProviderId,
    name: 'Zhipu AI (GLM)',
    placeholder: 'api_key_...',
    hint: 'Consíguela en open.bigmodel.cn. Modelos GLM 4, GLM 4 Flash.',
    icon: KeyRound,
  },
] as const;

export function AiSettings() {
  const queryClient = useQueryClient();
  const [keysInput, setKeysInput] = useState<Record<string, string>>({});

  const keysStatus = useQuery({
    queryKey: ['llm-keys'],
    queryFn: () => api.get<KeyStatusResponse>('/api/settings/keys'),
  });

  const aiEnabled = useQuery({
    queryKey: ['ai-enabled'],
    queryFn: () => api.get<{ enabled: boolean }>('/api/settings/ai'),
  });

  const saveKey = useMutation({
    mutationFn: ({ provider, key }: { provider: string; key: string }) =>
      api.put('/api/settings/keys', { provider, api_key: key }),
    onSuccess: (_, variables) => {
      toast.success(`Configuración de ${variables.provider.toUpperCase()} guardada`);
      setKeysInput((prev) => ({ ...prev, [variables.provider]: '' }));
      queryClient.invalidateQueries({ queryKey: ['llm-keys'] });
      queryClient.invalidateQueries({ queryKey: ['or-models'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo validar la configuración'),
  });

  const deleteKey = useMutation({
    mutationFn: (provider: string) => api.delete(`/api/settings/keys/${provider}`),
    onSuccess: (_, provider) => {
      toast.success(`Configuración de ${provider.toUpperCase()} eliminada`);
      queryClient.invalidateQueries({ queryKey: ['llm-keys'] });
      queryClient.invalidateQueries({ queryKey: ['or-models'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar'),
  });

  const toggleAi = useMutation({
    mutationFn: (enabled: boolean) => api.put('/api/settings/ai', { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-enabled'] }),
  });

  const freeProviders = providersList.filter((p) => 'isFree' in p && p.isFree);
  const paidProviders = providersList.filter((p) => !('isFree' in p && p.isFree));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Inteligencia artificial</h2>
        <p className="text-xs text-muted-foreground">Configuración de proveedores LLM — incluye opciones gratuitas sin API key</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Respuestas automáticas (global)</p>
          <p className="text-xs text-muted-foreground">
            Apaga esto para pausar la IA en todo el panel sin tocar cada conversación.
          </p>
        </div>
        <Switch
          checked={aiEnabled.data?.enabled ?? true}
          onCheckedChange={(on) => toggleAi.mutate(on)}
          data-testid="ai-global-toggle"
        />
      </div>

      {/* Sección de proveedores gratuitos */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-green-600 dark:text-green-400">
          Proveedores Gratuitos (sin costo)
        </h3>
        <div className="space-y-4">
          {freeProviders.map((p) => {
            const config = keysStatus.data?.[p.id];
            const inputVal = keysInput[p.id] ?? '';
            const Icon = p.icon;

            return (
              <div key={p.id} className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="mb-0 flex items-center gap-1.5 font-medium">
                    <Icon className="h-4 w-4" /> {p.name}
                  </Label>
                  {config?.configured && (
                    <div className="flex items-center gap-2">
                      <Badge variant="success">
                        <ShieldCheck className="h-3 w-3" /> Configurada {p.id === 'ollama' || p.id === 'opencode' ? '' : `····${config.last4}`}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`¿Eliminar la configuración de ${p.name}?`)) deleteKey.mutate(p.id);
                        }}
                        loading={deleteKey.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type={p.id === 'ollama' || p.id === 'opencode' ? 'text' : 'password'}
                    placeholder={p.placeholder}
                    value={inputVal}
                    onChange={(e) => setKeysInput((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <Button
                    variant="accent"
                    disabled={p.id === 'ollama' || p.id === 'opencode' ? false : inputVal.length < 8}
                    loading={saveKey.isPending && saveKey.variables?.provider === p.id}
                    onClick={() => saveKey.mutate({ provider: p.id, key: inputVal || (p.id === 'ollama' ? 'http://localhost:11434' : p.id === 'opencode' ? 'http://localhost:4010' : '') })}
                  >
                    Conectar
                  </Button>
                </div>
                <FieldHint>{p.hint}</FieldHint>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sección de proveedores de pago */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          Proveedores de Pago (requieren API key)
        </h3>
        <div className="space-y-4">
          {paidProviders.map((p) => {
            const config = keysStatus.data?.[p.id];
            const inputVal = keysInput[p.id] ?? '';
            const Icon = p.icon;

            return (
              <div key={p.id} className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="mb-0 flex items-center gap-1.5 font-medium">
                    <Icon className="h-4 w-4" /> {p.name}
                  </Label>
                  {config?.configured && (
                    <div className="flex items-center gap-2">
                      <Badge variant="success">
                        <ShieldCheck className="h-3 w-3" /> Configurada ····{config.last4}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`¿Eliminar la API key de ${p.name}?`)) deleteKey.mutate(p.id);
                        }}
                        loading={deleteKey.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={p.placeholder}
                    value={inputVal}
                    onChange={(e) => setKeysInput((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <Button
                    variant="accent"
                    disabled={inputVal.length < 8}
                    loading={saveKey.isPending && saveKey.variables?.provider === p.id}
                    onClick={() => saveKey.mutate({ provider: p.id, key: inputVal })}
                  >
                    Conectar
                  </Button>
                </div>
                <FieldHint>{p.hint}</FieldHint>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
