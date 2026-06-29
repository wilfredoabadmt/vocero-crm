import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  const brand = useQuery({
    queryKey: ['white-label'],
    queryFn: () => api.get<{ name: string; logo: string; accent_color: string }>('/api/settings/white-label'),
    staleTime: Infinity,
  });

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
            <p className="mt-1 text-sm text-slate-400">Crea tu cuenta de prueba gratis por 5 días</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-white/5 bg-[#0e1630]/60 backdrop-blur-lg p-8 shadow-2xl shadow-black/40 space-y-5">
          <div className="flex items-center gap-2 rounded-xl bg-lime-500/10 border border-lime-500/20 text-lime-400 px-3.5 py-2 text-xs font-semibold">
            <Sparkles className="h-4 w-4 shrink-0 text-lime-400" />
            Acceso total ilimitado. No requiere tarjeta.
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nombre del negocio / Asesor</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ej. Distribuidora Gomez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="border-white/10 bg-[#070b19]/60 text-white placeholder-slate-500 focus:border-lime-500/50 focus:ring-lime-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-white/10 bg-[#070b19]/60 text-white placeholder-slate-500 focus:border-lime-500/50 focus:ring-lime-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contraseña (mínimo 8 caracteres)</Label>
              <Input
                id="password"
                type="password"
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
              loading={register.isPending}
            >
              Crear cuenta y comenzar trial
            </Button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white font-medium transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
