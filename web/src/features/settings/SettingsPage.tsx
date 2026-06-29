import { Bot, Inbox, Milestone, Tags, Users, Zap, UserCheck, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AiSettings } from './AiSettings';
import { AssignmentSettings } from './AssignmentSettings';
import { InboxesSettings } from './InboxesSettings';
import { TagsStagesSettings } from './TagsStagesSettings';
import { UsersSettings } from './UsersSettings';
import { WorkflowsSettings } from './WorkflowsSettings';
import { N8nSettings } from './N8nSettings';
import { WhiteLabelSettings } from './WhiteLabelSettings';

const SECTIONS = [
  { id: 'bandejas', label: 'Bandejas', icon: Inbox, component: InboxesSettings },
  { id: 'usuarios', label: 'Usuarios', icon: Users, component: UsersSettings },
  { id: 'asignacion', label: 'Asignación automática', icon: UserCheck, component: AssignmentSettings },
  { id: 'ia', label: 'Inteligencia artificial', icon: Bot, component: AiSettings },
  { id: 'crm', label: 'Etiquetas y embudo', icon: Tags, component: TagsStagesSettings },
  { id: 'automatizaciones', label: 'Automatizaciones', icon: Zap, component: WorkflowsSettings },
  { id: 'n8n', label: 'Integración n8n', icon: Milestone, component: N8nSettings },
  { id: 'marca-blanca', label: 'Marca Blanca', icon: Sparkles, component: WhiteLabelSettings },
] as const;

export function SettingsPage({ section, user }: { section?: string; user: User }) {
  if (user.role !== 'admin') {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Solo los administradores pueden acceder a la configuración.
      </div>
    );
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const Component = current.component;

  return (
    <div className="flex h-full">
      <nav className="w-56 shrink-0 border-r bg-card/50 p-3">
        <h2 className="mb-3 px-2 text-sm font-semibold">Configuración</h2>
        <div className="space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`/ajustes/${id}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                current.id === id && 'bg-accent/10 font-medium text-accent',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
        <div className="mt-4 border-t px-2 pt-3">
          <Milestone className="mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Panel single-tenant autoalojado. Las credenciales de canal y la API key se cifran en reposo.
          </p>
        </div>
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        <Component />
      </div>
    </div>
  );
}
