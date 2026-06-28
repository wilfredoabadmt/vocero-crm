import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

export function LoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => api.post<{ user: User }>('/api/auth/login', { email, password }),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
      queryClient.invalidateQueries();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate();
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card overflow-hidden p-1 shadow-md">
            <img src="/logo.png" alt="CRM TOI Logo" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Panel CRM</h1>
            <p className="text-sm text-muted-foreground">Centraliza las conversaciones de tu negocio</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" loading={login.isPending} variant="accent">
              Iniciar sesión
            </Button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <Link href="/register" className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors">
            ¿Eres nuevo? Inicia una prueba gratuita de 5 días
          </Link>
        </div>
      </div>
    </div>
  );
}
