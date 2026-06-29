import { useState } from 'react';
import { 
  BookOpen, 
  Bot, 
  Inbox, 
  Kanban, 
  Megaphone, 
  CheckSquare, 
  Globe, 
  Zap, 
  ArrowRight,
  Sparkles,
  Info,
  CheckCircle2
} from 'lucide-react';

interface ManualSection {
  id: string;
  title: string;
  icon: any;
  description: string;
  steps: Array<{
    title: string;
    desc: string;
    example?: string;
  }>;
  mockup: {
    title: string;
    elements: string[];
  };
}

const SECTIONS: ManualSection[] = [
  {
    id: 'ia',
    title: 'Agente de IA (Educar Bot)',
    icon: Bot,
    description: 'Aprende a instruir y dotar de conocimiento a tu bot de Inteligencia Artificial para que responda de forma autónoma a las consultas de tus clientes por WhatsApp.',
    steps: [
      {
        title: 'Definir el Prompt (Comportamiento)',
        desc: 'Escribe las instrucciones de personalidad del bot en el campo de texto. Indica cómo debe saludar, en qué tono hablar (formal/amigable) y cuál es su objetivo.',
        example: '"Eres un asesor comercial para una inmobiliaria. Sé muy amable y responde de forma breve. Tu objetivo es obtener el correo del cliente para enviarle el catálogo de propiedades."'
      },
      {
        title: 'Cargar la Base de Conocimiento (PDF/TXT)',
        desc: 'Sube tus documentos corporativos (catálogos de precios, políticas de garantía, preguntas frecuentes). El sistema segmenta el texto e indexa la información para búsquedas instantáneas.',
        example: 'Subir el archivo "Precios_Y_Servicios_2026.pdf" para que la IA responda con precisión sobre costos y promociones sin equivocarse.'
      },
      {
        title: 'Validar y Testear el Chat',
        desc: 'Una vez cargados los documentos, la IA buscará semánticamente en ellos cada vez que un cliente escriba al canal de WhatsApp conectado.',
      }
    ],
    mockup: {
      title: 'Pantalla: Entrenar IA',
      elements: [
        'Caja de Instrucciones del Bot (Prompt)',
        'Zona de Arrastre de Archivos (Arrastra tus archivos aquí)',
        'Lista de Documentos Cargados (Garantia.pdf - Procesado con éxito)',
      ]
    }
  },
  {
    id: 'inbox',
    title: 'Bandeja de entrada (Inbox)',
    icon: Inbox,
    description: 'El centro operativo para tus agentes. Aquí se gestionan todos los chats de clientes de WhatsApp en tiempo real.',
    steps: [
      {
        title: 'Atención del Chat y Switch de IA',
        desc: 'Usa el interruptor de "Auto-respuesta de IA" en la parte superior derecha del chat. Si está activo, el Bot de IA contestará solo. Si el asesor responde un mensaje, el sistema apagará la IA automáticamente para darle el control al humano.',
        example: 'Si un cliente pide hablar con un supervisor, apaga el switch de IA y toma el control de forma manual.'
      },
      {
        title: 'Clasificación de Leads y Etapas',
        desc: 'En la columna derecha, asigna etiquetas (tags) al lead y actualiza su etapa comercial (ej. "Negociación") para mantener ordenado el flujo de ventas.',
      },
      {
        title: 'Agregar Notas Internas (Privadas)',
        desc: 'Escribe anotaciones de seguimiento en la pestaña de Notas. Estas notas son cronológicas y tu cliente de WhatsApp jamás podrá verlas.',
        example: '"El cliente pidió que le marquemos de nuevo el viernes por la mañana para cerrar el contrato."'
      }
    ],
    mockup: {
      title: 'Pantalla: Bandeja de Entrada',
      elements: [
        'Lista de Conversaciones (Filtros: No Leídos, Míos, IA)',
        'Ventana de Conversación Central (Mensajes de WhatsApp + Switch Activar IA)',
        'Ficha del Contacto Derecha (Etapa, Asesor Asignado, Tags, Notas Internas)',
      ]
    }
  },
  {
    id: 'kanban',
    title: 'Embudo de Ventas (Kanban)',
    icon: Kanban,
    description: 'Organiza visualmente tu proceso de prospección y ventas en un tablero de columnas estructuradas.',
    steps: [
      {
        title: 'Creación Rápida de Leads',
        desc: 'Haz clic en "Crear Lead" para añadir un prospecto a cualquier columna del embudo de forma inmediata.',
      },
      {
        title: 'Mover Clientes con Drag-and-Drop',
        desc: 'Arrastra las tarjetas de clientes de una columna a otra a medida que avancen en tu proceso de ventas.',
        example: 'Arrastrar al cliente "Juan Pérez" de la columna "Contacto Nuevo" a "Presentación de Demo" tras haber completado la videollamada.'
      },
      {
        title: 'Seguimiento Integrado',
        desc: 'Haz clic en el icono del chat de cualquier tarjeta de lead para abrir directamente su conversación en la Bandeja de Entrada sin perder el hilo comercial.',
      }
    ],
    mockup: {
      title: 'Pantalla: Embudo de Ventas',
      elements: [
        'Columnas de Etapas (Prospecto -> Contactado -> Demo -> Cerrado)',
        'Tarjetas de Clientes (Nombre, Teléfono, Tags de color, Avatar de Asesor)',
        'Mover tarjetas arrastrando con el cursor (Drag & Drop)',
      ]
    }
  },
  {
    id: 'broadcast',
    title: 'Campañas Masivas (Broadcast)',
    icon: Megaphone,
    description: 'Módulo para enviar notificaciones masivas de WhatsApp a tu base de datos segmentada.',
    steps: [
      {
        title: 'Filtrar la Audiencia de Destino',
        desc: 'Selecciona qué contactos recibirán el mensaje mediante filtros avanzados. Puedes filtrar por etapa de ventas, etiquetas específicas o puntuación de lead.',
        example: 'Enviar campaña de promoción sólo a los contactos con la etiqueta "Interesado" y que estén en la etapa comercial "Prospecto".'
      },
      {
        title: 'Seleccionar Plantilla Oficial de WhatsApp',
        desc: 'Elige la plantilla de WhatsApp pre-aprobada que vas a enviar. Las plantillas te garantizan un envío seguro libre de bloqueos/spam por parte de Meta.',
      },
      {
        title: 'Programar o Enviar Inmediatamente',
        desc: 'Elige si deseas lanzar la campaña en el momento o programarla para un día y hora específicos.',
      }
    ],
    mockup: {
      title: 'Pantalla: Campañas de Difusión',
      elements: [
        'Selector de Filtros (Filtra por Etapa, Tags y Puntuación)',
        'Cuerpo de Mensaje (Vista previa de la plantilla oficial a enviar)',
        'Estadísticas de Entrega (Enviados, Entregados, Leídos y Respondidos)',
      ]
    }
  },
  {
    id: 'landings',
    title: 'Landing Pages (Captación)',
    icon: Globe,
    description: 'Crea formularios y páginas de destino públicas en minutos para captar nuevos contactos automáticamente.',
    steps: [
      {
        title: 'Diseñar Título y Campos de Formulario',
        desc: 'Escribe el texto de tu landing page y selecciona qué campos deseas solicitar en el formulario (ej: Nombre, Teléfono, Correo). Puedes marcar campos como obligatorios.',
      },
      {
        title: 'Configurar Destino de Entrada',
        desc: 'Elige en qué etapa comercial del Kanban caerán los clientes que completen el formulario y cuál asesor se encargará de ellos.',
        example: 'Configurar para que los leads de la Landing entren en la columna "Contacto Nuevo" con la etiqueta "Web-Lead" y asignación automática al bot de IA.'
      },
      {
        title: 'Publicar y Compartir URL',
        desc: 'Copia el enlace de acceso público generado por el sistema y colócalo en tus redes sociales o campañas de anuncios para captar registros.',
        example: 'Compartir la URL "https://crm-toi.sslip.io/lp/mi-promo" en tu perfil de Instagram.'
      }
    ],
    mockup: {
      title: 'Pantalla: Creador de Landings',
      elements: [
        'Formulario de Edición (Título de Landing, Mensaje de Éxito)',
        'Constructor de Campos (Nombre, Correo, Teléfono, etc.)',
        'Enlace de Acceso Público (ej. /lp/nombre-landing)',
      ]
    }
  },
  {
    id: 'workflows',
    title: 'Automatizaciones (Workflows)',
    icon: Zap,
    description: 'Configura reglas de automatización basadas en disparadores y acciones para eliminar el trabajo repetitivo.',
    steps: [
      {
        title: 'Definir el Disparador (Trigger)',
        desc: 'Elige el evento inicial que activa el flujo de automatización.',
        example: '"Cuando un lead cambie a la etapa comercial Cerrado con Éxito"'
      },
      {
        title: 'Establecer Condiciones y Acciones',
        desc: 'Define qué acciones automáticas ejecutará el CRM de inmediato.',
        example: 'Acción: "Enviar plantilla de WhatsApp Agradecimiento y Asignar la Tarea Llamada de Feedback en 3 días al asesor responsable."'
      },
      {
        title: 'Activar y Monitorear',
        desc: 'Enciende el workflow para que comience a ejecutarse en segundo plano ante cada evento comercial.',
      }
    ],
    mockup: {
      title: 'Pantalla: Automatizaciones',
      elements: [
        'Disparador del Flujo (ej. Lead cambia de Etapa)',
        'Acción 1: Enviar plantilla oficial de WhatsApp',
        'Acción 2: Crear Tarea de Seguimiento de forma automática',
      ]
    }
  }
];

export function ManualPage() {
  const [activeSecId, setActiveSecId] = useState(SECTIONS[0]!.id);

  const activeSection = SECTIONS.find((s) => s.id === activeSecId)!;
  const ActiveIcon = activeSection.icon;

  return (
    <div className="relative flex h-full w-full bg-[#070b19] text-slate-100 overflow-hidden">
      {/* Resplandores de fondo holográficos */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 translate-x-1/2 w-[400px] h-[400px] rounded-full bg-lime-500/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex h-full w-full flex-col md:flex-row">
        {/* Panel lateral del índice */}
        <aside className="w-full md:w-64 shrink-0 border-r border-white/5 bg-[#0e1630]/40 backdrop-blur-md p-4 flex flex-col gap-2">
          <div className="mb-4 px-2 py-1.5 flex items-center gap-2 border-b border-white/5">
            <BookOpen className="h-5 w-5 text-lime-400" />
            <h1 className="font-bold text-sm tracking-wider uppercase text-white">Manual del CRM</h1>
          </div>
          
          <nav className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-1 pb-2 md:pb-0">
            {SECTIONS.map((sec) => {
              const SecIcon = sec.icon;
              const active = sec.id === activeSecId;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSecId(sec.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold whitespace-nowrap transition-all ${
                    active 
                      ? 'bg-lime-500/10 text-lime-400 border border-lime-500/20' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <SecIcon className="h-4 w-4 shrink-0" />
                  <span>{sec.title}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Panel principal de contenido */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-4xl space-y-8">
            
            {/* Cabecera de la sección activa */}
            <div className="flex flex-col gap-4 border-b border-white/5 pb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0e1630] border border-white/10 text-lime-400 shadow-lg">
                  <ActiveIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white">{activeSection.title}</h2>
                  <p className="text-xs text-lime-400 flex items-center gap-1.5 mt-0.5 font-semibold">
                    <Sparkles className="h-3.5 w-3.5" />
                    Guía y Paso a Paso Interactivos
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
                {activeSection.description}
              </p>
            </div>

            {/* Grid principal: Pasos a la izquierda, Mockup de referencia a la derecha */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              
              {/* Sección de los Pasos */}
              <div className="lg:col-span-3 space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-lime-500" />
                  Instrucciones de configuración
                </h3>
                
                <div className="space-y-4">
                  {activeSection.steps.map((step, idx) => (
                    <div 
                      key={idx} 
                      className="rounded-2xl border border-white/5 bg-[#0e1630]/60 backdrop-blur-md p-5 space-y-3 shadow-lg hover:shadow-black/20 hover:border-white/10 transition-all duration-300 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-lime-500" />
                      
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 font-bold text-xs">
                          {idx + 1}
                        </span>
                        <h4 className="text-sm font-bold text-white">{step.title}</h4>
                      </div>
                      
                      <p className="text-xs text-slate-300 leading-relaxed pl-9">
                        {step.desc}
                      </p>

                      {step.example && (
                        <div className="ml-9 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 flex gap-2 text-[11px] text-blue-300 leading-relaxed">
                          <Info className="h-4 w-4 shrink-0 text-blue-400" />
                          <div>
                            <span className="font-bold text-blue-400 block mb-0.5">Ejemplo práctico:</span>
                            {step.example}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mockup Simulado de la UI (Derecha) */}
              <div className="lg:col-span-2 flex flex-col">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-lime-500" />
                  Estructura Visual de la Pantalla
                </h3>

                <div className="rounded-2xl border border-white/10 bg-[#0e1630]/80 shadow-2xl relative overflow-hidden flex-1 flex flex-col min-h-[300px]">
                  {/* Barra de cabecera simulada del navegador */}
                  <div className="bg-[#070b19] px-4 py-2.5 flex items-center gap-1.5 border-b border-white/5">
                    <div className="h-2 w-2 rounded-full bg-red-500/80" />
                    <div className="h-2 w-2 rounded-full bg-yellow-500/80" />
                    <div className="h-2 w-2 rounded-full bg-green-500/80" />
                    <span className="text-[10px] text-slate-500 font-mono ml-4 select-none truncate">
                      crm_toi / {activeSection.id}
                    </span>
                  </div>

                  {/* Cuerpo del mockup */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-lime-400 block border-b border-lime-500/20 pb-1">
                        {activeSection.mockup.title}
                      </span>
                      
                      <div className="space-y-2">
                        {activeSection.mockup.elements.map((el, i) => (
                          <div 
                            key={i} 
                            className="rounded-lg border border-white/5 bg-[#070b19]/60 px-3 py-2 text-[10px] text-slate-300 font-semibold flex items-center gap-2"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
                            {el}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-[#070b19]/40 p-3 text-[10px] text-slate-400 leading-relaxed text-center italic">
                      Interactúa con estas secciones desde el menú lateral para configurarlas en tu CRM.
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
