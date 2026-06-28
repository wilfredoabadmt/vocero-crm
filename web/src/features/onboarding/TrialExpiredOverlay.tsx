import { useState } from 'react';
import { CreditCard, ShieldAlert, Sparkles, LogOut, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { User } from '@/lib/types';

interface TrialExpiredOverlayProps {
  user: User;
}

export function TrialExpiredOverlay({ user }: TrialExpiredOverlayProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSimulatePayment = async () => {
    setLoading(true);
    try {
      // Llamar al webhook de Stripe mockeado del backend para activar la suscripción
      const res = await api.post<{ processed: boolean; new_status: string }>('/api/integrations/stripe/webhook', {
        event: 'checkout.session.completed',
        status: 'active',
      });

      if (res.processed) {
        setSuccess(true);
        toast.success('¡Pago simulado con éxito!', {
          description: 'Suscripción de Stripe activada. Desbloqueando tu CRM...',
        });

        // Retrasar el refresco 1.5s para que se aprecie la transición premium
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['me'] });
        }, 1500);
      }
    } catch {
      toast.error('No se pudo simular el pago. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout', {});
      queryClient.setQueryData(['me'], null);
      queryClient.invalidateQueries();
    } catch {
      toast.error('No se pudo cerrar sesión.');
    }
  };

  if (!user.trial_expired) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md animate-in fade-in duration-500">
      <div className="relative w-full max-w-md border bg-card p-8 rounded-2xl shadow-2xl space-y-6 mx-4 text-center border-destructive/20 animate-in zoom-in-95 duration-300">
        
        {/* Alerta de expiración */}
        <div className="flex justify-center">
          <div className="rounded-2xl bg-destructive/10 p-4 text-destructive animate-pulse">
            <ShieldAlert className="h-10 w-10" />
          </div>
        </div>

        {/* Mensaje principal */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Periodo de Prueba Finalizado
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tu cuenta de prueba gratuita de 5 días para <strong className="text-foreground">{user.name}</strong> ha expirado. 
            Para continuar centralizando tus canales de WhatsApp y automatizando con agentes de IA, por favor activa tu suscripción.
          </p>
        </div>

        {/* Ventajas del SaaS */}
        <div className="rounded-xl bg-muted/50 p-4 text-left space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            ¿Qué incluye tu plan ilimitado?
          </h3>
          <ul className="text-xs space-y-1.5 text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Inbox multiagente ilimitado para WhatsApp
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Motor de flujos y automatizaciones sin límites
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Copiloto de sugerencias e inteligencia artificial
            </li>
          </ul>
        </div>

        {/* Acciones */}
        <div className="space-y-3">
          {success ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white py-3 text-sm font-bold shadow-md shadow-emerald-500/25 animate-in zoom-in-95 duration-200">
              <Check className="h-5 w-5" /> ¡CRM Desbloqueado!
            </div>
          ) : (
            <button
              onClick={handleSimulatePayment}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground py-3 text-sm font-bold hover:bg-accent/90 shadow-lg shadow-accent/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Simular Pago de Suscripción (Stripe)
            </button>
          )}

          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold py-1.5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión e ir a Login
          </button>
        </div>
      </div>
    </div>
  );
}
