/**
 * Página del Agente de IA — /agent
 *
 * Esta página carga el componente cliente del agente.
 * Adapta el layout a la estructura de tu app (probablemente ya tienes
 * un layout en (app)/layout.tsx con sidebar).
 */

import { AgentClient } from "@/components/agent/agent-client";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  return <AgentClient />;
}
