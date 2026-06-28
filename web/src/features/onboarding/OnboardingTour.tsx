import { useState, useEffect } from 'react';
import { Bot, Inbox, Kanban, BarChart3, Settings, Sparkles, Check, ArrowRight, HelpCircle } from 'lucide-react';
import type { User } from '@/lib/types';

interface OnboardingTourProps {
  user: User;
}

interface Step {
  title: string;
  description: string;
  icon: any;
  target?: string; // Para dar contexto visual de qué se está explicando
}

export function OnboardingTour({ user }: OnboardingTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const localStorageKey = `crm_onboarding_completed_${user.id}`;

  useEffect(() => {
    // Verificar si ya completó el tour
    const completed = localStorage.getItem(localStorageKey);
    if (!completed) {
      // Retrasar el inicio 1.5s para permitir que la interfaz renderice limpia
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [localStorageKey]);

  const steps: Step[] = [
    {
      title: `¡Te damos la bienvenida, ${user.name}!`,
      description: 'Vamos a dar un recorrido rápido de 1 minuto para mostrarte cómo administrar las conversaciones y automatizar tu negocio.',
      icon: Sparkles,
    },
    {
      title: 'Bandeja de entrada centralizada',
      description: 'Aquí recibes todos los chats de WhatsApp en tiempo real. Los asesores pueden responder libremente y adjuntar archivos.',
      icon: Inbox,
    },
    {
      title: 'Embudo de Ventas (Kanban)',
      description: 'Arrastra y suelta las tarjetas de tus leads entre las 4 etapas comerciales configurables para calificar su proceso de venta.',
      icon: Kanban,
    },
    {
      title: 'Métricas y Dashboard',
      description: 'Monitorea en tiempo real el rendimiento del equipo, volumen de mensajes, tiempos de respuesta y tasa de conversión.',
      icon: BarChart3,
    },
    {
      title: 'Agentes de IA (Copilotos)',
      description: 'Configura asistentes virtuales con personalidad propia y carga documentos como FAQ o catálogos para respuestas automáticas.',
      icon: Bot,
    },
    {
      title: 'Automatizaciones avanzadas',
      description: 'En el panel de configuración (Ajustes) puedes definir reglas como "Enviar plantilla de WhatsApp automática al pasar a etapa Calificado".',
      icon: Settings,
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem(localStorageKey, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const step = steps[currentStep]!;
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-300">
      <div className="relative w-full max-w-md border bg-card p-6 rounded-2xl shadow-2xl space-y-6 mx-4 animate-in zoom-in-95 duration-200">
        
        {/* Progreso */}
        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5 text-accent" />
            Guía de Onboarding
          </span>
          <span>
            Paso {currentStep + 1} de {steps.length}
          </span>
        </div>

        {/* Círculos de Progreso */}
        <div className="flex gap-1.5 h-1">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 rounded-full transition-all duration-300 ${
                idx <= currentStep ? 'bg-accent' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Icono central de paso */}
        <div className="flex justify-center">
          <div className="rounded-2xl bg-accent/10 p-4 text-accent animate-bounce">
            <Icon className="h-8 w-8" />
          </div>
        </div>

        {/* Contenido */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold tracking-tight">{step.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 justify-between items-center border-t pt-4">
          <button
            onClick={handleComplete}
            className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            Omitir recorrido
          </button>
          
          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-xl bg-accent text-accent-foreground px-4 py-2 text-xs font-bold hover:bg-accent/90 shadow-sm transition-all"
          >
            {currentStep === steps.length - 1 ? (
              <>
                Entendido, comenzar <Check className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Siguiente paso <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
