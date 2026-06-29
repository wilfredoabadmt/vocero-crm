import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { 
  Sparkles, 
  Bot, 
  Megaphone, 
  Kanban, 
  Zap, 
  BookOpen, 
  MessageSquare, 
  PlusCircle, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(expiryDateStr: string | null | undefined): TimeLeft {
  if (!expiryDateStr) return { days: 5, hours: 0, minutes: 0, seconds: 0 };
  const difference = +new Date(expiryDateStr) - +new Date();
  if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

export function TrialWelcomePage({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => 
    calculateTimeLeft(user.trial_expires_at)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(user.trial_expires_at));
    }, 1000);

    return () => clearInterval(timer);
  }, [user.trial_expires_at]);

  const startExploring = () => {
    // Redirige al Inbox
    setLocation('/inbox');
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#070b19] text-slate-100 overflow-hidden pb-16">
      {/* Resplandores de fondo holográficos */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[150px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[400px] rounded-full bg-lime-500/5 blur-[100px] pointer-events-none" />

      {/* Banner de Cabecera */}
      <header className="relative z-10 mx-auto max-w-7xl px-6 py-6 w-full flex items-center justify-between border-b border-white/5 bg-[#070b19]/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="CRM TOI Logo" className="h-8 w-8 object-contain" />
          <span className="font-extrabold text-lg text-white tracking-wider">CRM TOI</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-lime-500/20 bg-lime-500/10 px-4 py-1.5 text-xs text-lime-400 font-semibold animate-pulse">
          <Sparkles className="h-3.5 w-3.5" />
          Modo Prueba Activo
        </div>
      </header>

      {/* Hero Section & Contador */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-12 text-center w-full">
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Lleva las Ventas de tu Negocio al <span className="text-[#84cc16] hover:shadow-[0_0_30px_rgba(132,204,22,0.6)] transition-all">Siguiente Nivel</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-300 text-sm sm:text-base leading-relaxed">
          Ya creaste tu cuenta gratuita. Para ayudarte a validar el sistema, tienes acceso total ilimitado a todos nuestros módulos de IA, automatizaciones y campañas de WhatsApp.
        </p>

        {/* Panel del Contador Regresivo */}
        <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-[#84cc16]/10 bg-[#0e1630]/70 backdrop-blur-lg p-6 shadow-xl shadow-black/35 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#84cc16]/30 to-transparent" />
          
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Tiempo de prueba restante</h2>
          
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-[#070b19]/80 border border-white/5 p-3 min-w-[70px]">
              <span className="block text-2xl sm:text-3xl font-extrabold text-white font-mono">{timeLeft.days}</span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Días</span>
            </div>
            <div className="rounded-xl bg-[#070b19]/80 border border-white/5 p-3 min-w-[70px]">
              <span className="block text-2xl sm:text-3xl font-extrabold text-white font-mono">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Horas</span>
            </div>
            <div className="rounded-xl bg-[#070b19]/80 border border-white/5 p-3 min-w-[70px]">
              <span className="block text-2xl sm:text-3xl font-extrabold text-white font-mono">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Mins</span>
            </div>
            <div className="rounded-xl bg-[#070b19]/80 border border-white/5 p-3 min-w-[70px]">
              <span className="block text-2xl sm:text-3xl font-extrabold text-lime-400 font-mono">{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-[10px] uppercase font-semibold text-lime-400/80 tracking-wider">Segs</span>
            </div>
          </div>
          
          <p className="mt-4 text-xs text-slate-400">
            Al terminar el trial, podrás contratar un plan mensual para seguir usando tu número sin perder tus leads.
          </p>
        </div>
      </section>

      {/* Virtudes del Sistema (Grilla) */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 w-full">
        <h2 className="text-center text-xl sm:text-2xl font-bold text-white mb-8">Descubre el poder de CRM TOI</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Tarjeta 1: IA */}
          <div className="group rounded-2xl border border-white/5 bg-[#0e1630]/50 backdrop-blur-md p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#84cc16]/20 shadow-lg hover:shadow-black/40">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Bot className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-[#84cc16] transition-colors">IA Autónoma 24/7</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Sube tus documentos, entrena al agente inteligente y deja que conteste dudas y califique prospectos por WhatsApp de forma natural a cualquier hora.
            </p>
          </div>

          {/* Tarjeta 2: Masivos */}
          <div className="group rounded-2xl border border-white/5 bg-[#0e1630]/50 backdrop-blur-md p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#84cc16]/20 shadow-lg hover:shadow-black/40">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
              <Megaphone className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-[#84cc16] transition-colors">Envíos Masivos Filtrados</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Realiza campañas masivas (Broadcast) a tu base de contactos segmentando por tags, score de lead o su etapa en el embudo.
            </p>
          </div>

          {/* Tarjeta 3: Kanban */}
          <div className="group rounded-2xl border border-white/5 bg-[#0e1630]/50 backdrop-blur-md p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#84cc16]/20 shadow-lg hover:shadow-black/40">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
              <Kanban className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-[#84cc16] transition-colors">Embudo de Ventas Kanban</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Controla visualmente el estado de tus leads. Arrastra y suelta para cambiar etapas de ventas y medir tus conversiones comerciales.
            </p>
          </div>

          {/* Tarjeta 4: Workflows */}
          <div className="group rounded-2xl border border-white/5 bg-[#0e1630]/50 backdrop-blur-md p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#84cc16]/20 shadow-lg hover:shadow-black/40">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#84cc16]/10 text-lime-400">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-[#84cc16] transition-colors">Automatizaciones (Workflows)</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Crea flujos para automatizar tareas, reasignaciones de asesores y envíos automáticos de plantillas basados en disparadores y reglas de negocio.
            </p>
          </div>
        </div>
      </section>

      {/* Primeros Pasos Guiados */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-16 w-full">
        <div className="rounded-2xl border border-white/5 bg-[#0e1630]/40 backdrop-blur-md p-8 md:p-10 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Guía de Inicio Rápido</h2>
              <p className="mt-1 text-xs text-slate-300">
                Sigue estos pasos sencillos para validar todo el poder del CRM hoy mismo.
              </p>
              
              <ul className="mt-6 space-y-3.5 text-xs text-slate-300">
                <li className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 font-bold text-[10px]">1</span>
                  <span><strong>Conecta tu número:</strong> Ve a Ajustes y vincula tu número oficial de WhatsApp.</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 font-bold text-[10px]">2</span>
                  <span><strong>Educa a la IA:</strong> Sube tus políticas o catálogo PDF en el módulo "Entrenar IA".</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 font-bold text-[10px]">3</span>
                  <span><strong>Prueba la auto-respuesta:</strong> Escríbete por WhatsApp y valida la respuesta del bot.</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3 min-w-[200px] shrink-0 justify-center">
              <Button 
                onClick={startExploring}
                className="w-full bg-[#84cc16] hover:bg-[#a3e635] text-[#070b19] font-bold py-3 rounded-xl transition-all duration-300 shadow-lg shadow-lime-500/15 hover:shadow-[0_0_20px_rgba(132,204,22,0.4)] flex items-center justify-center gap-2 border-0"
              >
                Comenzar Exploración
                <ArrowRight className="h-4 w-4" />
              </Button>
              
              <a 
                href="/manual_crm_toi.md" 
                target="_blank" 
                rel="noreferrer" 
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#070b19]/60 px-4 py-2.5 text-xs text-slate-300 font-semibold hover:bg-white/5 hover:text-white transition-all duration-300"
              >
                <BookOpen className="h-4 w-4" />
                Leer Manual Completo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer / Garantía */}
      <footer className="relative z-10 mx-auto max-w-5xl px-6 pt-16 text-center w-full text-xs text-slate-500 flex flex-col items-center gap-2">
        <div className="flex items-center gap-1.5 text-slate-400">
          <ShieldCheck className="h-4 w-4 text-lime-500/80" />
          Plataforma de prueba segura protegida contra spam.
        </div>
        <p>© 2026 CRM TOI. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
