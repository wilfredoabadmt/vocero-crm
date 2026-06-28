import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Sparkles, ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { toast } from 'sonner';

export function RegisterPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => api.post<{ user: User }>('/api/auth/register', { name, email, password }),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
      queryClient.invalidateQueries();
      toast.success('¡Cuenta de prueba creada!', {
        description: 'Disfruta de 5 días de acceso ilimitado a todas las características del CRM.',
      });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta de prueba'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    register.mutate();
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card overflow-hidden p-1 shadow-md">
            <img src="/logo.png" alt="CRM TOI Logo" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">CRM TOI Trial</h1>
            <p className="text-xs text-muted-foreground mt-1">Crea tu cuenta de prueba gratis por 5 días</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-1.5 rounded-md bg-accent/10 text-accent px-3 py-2 text-[11px] font-semibold">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            Acceso total ilimitado. No requiere tarjeta.
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre del negocio / Asesor</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ej. Distribuidora Gomez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña (mínimo 8 caracteres)</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" loading={register.isPending} variant="accent">
              Crear cuenta y comenzar trial
            </Button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors">
            <ArrowLeft className="h-3 w-3" />
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
