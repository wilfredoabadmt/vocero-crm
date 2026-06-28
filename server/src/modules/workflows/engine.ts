import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflows, workflowLogs, conversations, contacts } from '../../db/schema.js';
import { onEvent } from '../../lib/events.js';
import { sendMessage } from '../messages/send.js';
import { broadcast } from '../../realtime/hub.js';
import { serializeConversation } from '../conversations/serialize.js';

// Estructura de tipos de condiciones y acciones soportadas
interface WorkflowCondition {
  stageId?: number;
  direction?: 'in' | 'out';
}

interface WorkflowAction {
  type: 'send_whatsapp_template' | 'send_email_mock' | 'assign_agent' | 'trigger_n8n_webhook';
  templateId?: number;
  agentId?: number;
  emailTo?: string;
  emailBody?: string;
  n8nWebhookUrl?: string;
}

export function initWorkflows() {
  console.log('Inicializando motor de automatizaciones (Workflows)...');

  // 1. Escuchar cuando un contacto cambia de etapa en el Kanban
  onEvent('lead:stage_changed', async (payload) => {
    const activeRules = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.trigger, 'lead_stage_changed'), eq(workflows.isActive, true)));

    for (const rule of activeRules) {
      try {
        const conditions = rule.conditions as WorkflowCondition;
        // Evaluar condición: Si especifica una etapa, debe coincidir con la etapa de destino
        if (conditions.stageId && Number(conditions.stageId) !== payload.toStageId) {
          continue;
        }

        await executeWorkflow(rule, payload.contactId);
      } catch (err) {
        console.error(`Error al procesar flujo ${rule.id} para contacto ${payload.contactId}:`, err);
      }
    }
  });

  // 2. Escuchar cuando se crea un mensaje (entrante o saliente)
  onEvent('message:created', async (payload) => {
    const activeRules = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.trigger, 'message_created'), eq(workflows.isActive, true)));

    for (const rule of activeRules) {
      try {
        const conditions = rule.conditions as WorkflowCondition;
        // Evaluar dirección del mensaje
        if (conditions.direction && conditions.direction !== payload.direction) {
          continue;
        }

        // Buscar el contacto asociado a la conversación para poder ejecutar el flujo
        const [conv] = await db
          .select({ contactId: conversations.contactId })
          .from(conversations)
          .where(eq(conversations.id, payload.conversationId));

        if (!conv) continue;

        await executeWorkflow(rule, conv.contactId, payload.conversationId);
      } catch (err) {
        console.error(`Error al procesar flujo ${rule.id} para conversación ${payload.conversationId}:`, err);
      }
    }
  });
}

/**
 * Ejecuta de forma secuencial las acciones programadas en una regla
 */
async function executeWorkflow(
  rule: typeof workflows.$inferSelect,
  contactId: number,
  forcedConversationId?: number
) {
  // Buscar conversación activa
  let conversationId = forcedConversationId;
  if (!conversationId) {
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.contactId, contactId))
      .limit(1);
    conversationId = conv?.id;
  }

  if (!conversationId) {
    // Si no hay conversación abierta (raro), no podemos ejecutar acciones conversacionales
    await db.insert(workflowLogs).values({
      workflowId: rule.id,
      contactId,
      status: 'failed',
      error: 'No se encontró una conversación activa para este contacto.',
    });
    return;
  }

  const actions = rule.actions as WorkflowAction[];
  let successCount = 0;
  const errors: string[] = [];

  for (const action of actions) {
    try {
      if (action.type === 'send_whatsapp_template') {
        if (!action.templateId) throw new Error('Falta especificar templateId para el envío de WhatsApp');
        
        // Enviar plantilla de WhatsApp de forma automática (usa variables vacías por defecto en automatización básica)
        await sendMessage(
          conversationId,
          { type: 'template', template_id: action.templateId, variables: [] },
          { kind: 'ai_agent', agentId: 0, name: `Sistema (${rule.name})` } // Autoría del sistema
        );
        successCount++;
      } 
      
      else if (action.type === 'send_email_mock') {
        // Simular envío de correo electrónico
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
        const email = action.emailTo || contact?.phone || 'cliente@negocio.local';
        console.log(`[Email MOCK] Enviando correo a ${email} con motivo: ${action.emailBody || 'Automatización'}`);
        successCount++;
      } 
      
      else if (action.type === 'assign_agent') {
        if (!action.agentId) throw new Error('Falta especificar agentId para asignar el agente');
        
        // Asignar el agente de IA a la conversación
        await db
          .update(conversations)
          .set({ assignedAgentId: action.agentId, autoReply: 'active' })
          .where(eq(conversations.id, conversationId));

        const summary = await serializeConversation(conversationId);
        if (summary) {
          broadcast('conversation:updated', summary);
        }
        successCount++;
      }
      
      else if (action.type === 'trigger_n8n_webhook') {
        if (!action.n8nWebhookUrl) throw new Error('Falta especificar la URL del webhook de n8n');

        const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));

        const payload = {
          event: rule.trigger,
          rule_name: rule.name,
          contact: {
            id: contact?.id,
            name: contact?.name,
            phone: contact?.phone,
            wa_id: contact?.waId,
            stage_id: contact?.stageId,
            lead_scoring: contact?.leadScoring,
          },
          conversation_id: conversationId,
          timestamp: new Date().toISOString(),
        };

        console.log(`[n8n Webhook] Disparando webhook hacia: ${action.n8nWebhookUrl}`);

        const response = await fetch(action.n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`n8n respondió con estatus HTTP ${response.status}`);
        }

        successCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      errors.push(`${action.type}: ${msg}`);
    }
  }

  // Registrar estado final en la base de datos
  const finalStatus = errors.length === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed';
  await db.insert(workflowLogs).values({
    workflowId: rule.id,
    contactId,
    status: finalStatus,
    error: errors.length > 0 ? errors.join('; ') : null,
  });
}
