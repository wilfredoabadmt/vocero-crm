/**
 * Datos semilla para la Knowledge Base del Agente ISP.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  INSTRUCCIONES:                                                     ║
 * ║  1. Edita los datos abajo con la información REAL de tu ISP         ║
 * ║  2. Ejecuta: npx tsx docs/KB-SEED.ts                                ║
 * ║  3. Requiere: variables de entorno DATABASE_URL configuradas        ║
 * ║                                                                   ║
 * ║  ADAPTACIÓN:                                                        ║
 * ║  - Cambia los nombres de tablas si tu esquema es diferente           ║
 * ║  - Cambia el organizationId por el ID real de tu organización       ║
 * ║  - Agrega/elimina entradas según tu ISP                             ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

import { nanoid } from "nanoid";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN — CAMBIA ESTOS VALORES                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

const ORGANIZATION_ID = "REEMPLAZA_CON_TU_ORG_ID"; // <-- Tu org ID real

// ─── Datos ISP de ejemplo (reemplaza con los tuyos) ──────────────────────────

const QA_ENTRIES = [
  {
    question: "¿Cuánto cuesta el plan básico?",
    answer:
      "El plan básico de 50 Mbps tiene un costo de $350 MXN mensuales. Incluye módem WiFi y soporte técnico remoto. El pago es antes del día 5 de cada mes.",
  },
  {
    question: "¿Cuánto cuesta el plan de 100 Mbps?",
    answer:
      "El plan de 100 Mbps cuesta $450 MXN al mes. Incluye módem WiFi dual band y soporte técnico prioritario. Pago antes del día 5.",
  },
  {
    question: "¿Cuánto cuesta el plan de 200 Mbps?",
    answer:
      "El plan de 200 Mbps tiene un costo de $600 MXN mensuales. Incluye router WiFi 6 y soporte técnico prioritario 24/7. Pago antes del día 5.",
  },
  {
    question: "¿Qué formas de pago aceptan?",
    answer:
      "Aceptamos transferencia bancaria (SPEI), depósito en efectivo, pago en tienda de conveniencia (OXXO, 7-Eleven), y débito automático. Los datos bancarios son: Banco BBVA, Cuenta: 0123456789, CLABE: 012345678901234567, a nombre de TOI Telecomunicaciones SA de CV.",
  },
  {
    question: "¿Hasta qué hora prestan servicio técnico?",
    answer:
      "Nuestro horario de soporte técnico es de lunes a viernes de 8:00 a 20:00 hrs, y sábados de 9:00 a 14:00 hrs. Para emergencias fuera de horario, envía un WhatsApp y al día hábil siguiente te atendemos.",
  },
  {
    question: "¿Qué hago si se me va el internet?",
    answer:
      "Primero verifica que el módem tenga luces encendidas. Si parpadean o están apagadas, intenta: 1) Apaga el módem 30 segundos y vuelve a encenderlo. 2) Verifica que los cables estén bien conectados. 3) Si persiste, háblanos por este canal y coordinamos una revisión técnica.",
  },
  {
    question: "¿Cómo cambio de plan?",
    answer:
      "Para cambiar de plan envía un mensaje con tu nombre y el plan al que deseas migrar. El cambio se aplica en el próximo ciclo de facturación. No hay penalización por cambio de plan.",
  },
  {
    question: "¿Puedo pausar mi servicio?",
    answer:
      "Sí, puedes pausar tu servicio hasta 2 meses al año sin costo. Después de 2 meses de pausa, se cobra una reconexión de $200 MXN. Solicita la pausa con al menos 3 días de anticipación.",
  },
  {
    question: "¿Qué es el MikroTik y por qué me preguntan?",
    answer:
      "MikroTik es la marca de los routers que instalamos en puntos estratégicos de la red. Si reportas problemas de velocidad o desconexiones, es posible que necesitemos revisar la configuración del MikroTik que te da servicio.",
  },
  {
    question: "¿Cómo genero mi comprobante de pago?",
    answer:
      "Los comprobantes de pago se generan automáticamente después de confirmar tu pago. Si no lo recibiste, envía tu comprobante de transferencia por este canal y te lo enviamos al instante.",
  },
  {
    question: "¿Tienen servicio de televisión o teléfono?",
    answer:
      "En este momento ofrecemos únicamente servicio de internet. Estamos trabajando para agregar IPTV y telefonía VoIP en el futuro. ¡Te mantendremos informado!",
  },
  {
    question: "¿Cuánto tarda la instalación?",
    answer:
      "La instalación se realiza dentro de las 24-48 horas hábiles después de la activación. Incluye cableado hasta 30 metros, módem WiFi y configuración básica. Si necesitas cableado adicional, tiene un costo extra de $15 por metro.",
  },
];

const BLOCK_ENTRIES = [
  {
    content: `PLANES Y PRECIOS vigentes (actualizar cada cambio):
• Plan Básico: 50 Mbps — $350 MXN/mes
• Plan Estándar: 100 Mbps — $450 MXN/mes
• Plan Premium: 200 Mbps — $600 MXN/mes
• Plan Empresarial: 500 Mbps — $1,200 MXN/mes (SLA 99.9%)
Todos los planes incluyen módem WiFi y soporte técnico. Pago mensual antes del día 5.`,
  },
  {
    content: `POLÍTICA DE PAGOS:
• Fecha límite de pago: día 5 de cada mes
• Recargo por pago tardío: $100 MXN después del día 10
• Suspensión del servicio: día 15 sin pago
• Reconexión: $200 MXN después de suspensión
• Formas de pago: transferencia SPEI, depósito, OXXO/7-Eleven, débito automático
• Datos bancarios: BBVA, Cta: 0123456789, CLABE: 012345678901234567, TOI Telecomunicaciones SA de CV`,
  },
  {
    content: `HORARIOS DE ATENCIÓN:
• Lunes a viernes: 8:00 - 20:00 hrs
• Sábados: 9:00 - 14:00 hrs
• Domingos y feriados: cerrado (mensajes se responden al siguiente hábil)
• Soporte técnico remoto: dentro del horario de atención
• Emergencias fuera de horario: mensaje por WhatsApp, respuesta al día hábil`,
  },
  {
    content: `REDES Y EQUIPOS:
• Usamos routers MikroTik en la red troncal
• Módems asignados: Huawei HG8245H (fibra), TP-Link Archer C50 (radio)
• El usuario NO debe modificar configuración del módem
• Si se detecta manipulación, se cobra reposición: $800 MXN
• El módem es propiedad de TOI, debe devolverse al cancelar el servicio`,
  },
  {
    content: `ZONA DE COBERTURA:
• Zona Norte: colonias Las Flores, El Pedregal, San Juan, La Esperanza
• Zona Centro: centro histórico, colonia Centro, Av. Principal
• Zona Sur: fraccionamientos Las Palmas, El Rosario, Villa Nueva
• NO cubrimos: zonas rurales fuera del perímetro urbano
• Expansión en proceso: consultar disponibilidad`,
  },
  {
    content: `INFORMACIÓN DE LA EMPRESA:
• Razón social: TOI Telecomunicaciones SA de CV
• RFC: TTT230101XYZ
• Dirección: Av. Principal #123, Col. Centro, C.P. 68000
• Teléfono: (951) 123-4567
• Email: soporte@toi-isp.com
• WhatsApp: este mismo número`,
  },
];

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  EJECUCIÓN — No editar debajo de esta línea                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

async function main() {
  const orgId = ORGANIZATION_ID;

  if (orgId === "REEMPLAZA_CON_TU_ORG_ID") {
    console.error(
      "❌ ERROR: Debes reemplazar ORGANIZATION_ID en este archivo con el ID real de tu organización."
    );
    console.error(
      "   Ejecuta: SELECT id FROM organization LIMIT 1; para obtenerlo."
    );
    process.exit(1);
  }

  console.log(`🚀 Sembrando knowledge base para organización: ${orgId}\n`);

  // Aquí puedes usar tu ORM favorito (Drizzle, Prisma, pg, etc.)
  // Ejemplo con pg directo:
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    // Insertar entradas Q&A
    for (const qa of QA_ENTRIES) {
      const id = `kb_${nanoid(21)}`;
      await client.query(
        `INSERT INTO kb_entry (id, organization_id, kind, question, answer, created_at, updated_at)
         VALUES ($1, $2, 'qa', $3, $4, now(), now())`,
        [id, orgId, qa.question, qa.answer]
      );
      console.log(`  ✅ Q&A: ${qa.question.substring(0, 50)}...`);
    }

    // Insertar bloques
    for (const block of BLOCK_ENTRIES) {
      const id = `kb_${nanoid(21)}`;
      await client.query(
        `INSERT INTO kb_entry (id, organization_id, kind, content, created_at, updated_at)
         VALUES ($1, $2, 'block', $3, now(), now())`,
        [id, orgId, block.content]
      );
      console.log(
        `  📝 Bloque: ${block.content.substring(0, 50).replace(/\n/g, " ")}...`
      );
    }

    console.log(
      `\n✨ ¡Listo! ${QA_ENTRIES.length} preguntas + ${BLOCK_ENTRIES.length} bloques insertados.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error durante el seed:", err);
  process.exit(1);
});
