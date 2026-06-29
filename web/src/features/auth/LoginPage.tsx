import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  const brand = useQuery({
    queryKey: ['white-label'],
    queryFn: () => api.get<{ name: string; logo: string; accent_color: string }>('/api/settings/white-label'),
    staleTime: Infinity,
  });

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
    <div className="relative flex min-h-screen w-full items-center justify-center bg-[#070b19] text-slate-100 overflow-hidden p-4">
      {/* Resplandores de fondo futuristas */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-blue-500/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#0e1630]/80 border border-white/10 overflow-hidden p-2 shadow-xl shadow-black/25">
            <img src={brand.data?.logo ?? '/logo.png'} alt="Logo" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">{brand.data?.name ?? 'CRM TOI'}</h1>
            <p className="mt-1 text-sm text-slate-400">Centraliza las conversaciones de tu negocio</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-white/5 bg-[#0e1630]/60 backdrop-blur-lg p-8 shadow-2xl shadow-black/40">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="border-white/10 bg-[#070b19]/60 text-white placeholder-slate-500 focus:border-lime-500/50 focus:ring-lime-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-white/10 bg-[#070b19]/60 text-white placeholder-slate-500 focus:border-lime-500/50 focus:ring-lime-500/20"
              />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</p>}
            
            <Button 
              type="submit" 
              className="w-full mt-2 bg-[#84cc16] hover:bg-[#a3e635] text-[#070b19] font-bold py-2.5 rounded-xl transition-all duration-300 shadow-lg shadow-lime-500/10 hover:shadow-[0_0_20px_rgba(132,204,22,0.4)] border-0" 
              loading={login.isPending}
            >
              Iniciar sesión
            </Button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <Link href="/register" className="text-xs text-slate-400 hover:text-white font-medium transition-colors">
            ¿Eres nuevo? Inicia una prueba gratuita de 5 días
          </Link>
        </div>
      </div>
    </div>
  );
}
