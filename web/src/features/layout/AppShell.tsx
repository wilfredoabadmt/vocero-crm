import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Inbox,
  Kanban,
  LayoutTemplate,
  LogOut,
  MessageSquareText,
  Moon,
  Settings,
  Sun,
  Monitor,
  BarChart3,
  GraduationCap,
  Megaphone,
  CheckSquare,
  Bell,
  Globe,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Avatar, Tooltip } from '@/components/ui/misc';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', icon: Inbox, label: 'Bandeja de entrada' },
  { href: '/kanban', icon: Kanban, label: 'Embudo' },
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/plantillas', icon: LayoutTemplate, label: 'Plantillas' },
  { href: '/campanas', icon: Megaphone, label: 'Campañas' },
  { href: '/tareas', icon: CheckSquare, label: 'Tareas' },
  { href: '/alertas', icon: Bell, label: 'Alertas' },
  { href: '/landing-pages', icon: Globe, label: 'Landing Pages' },
  { href: '/agentes', icon: GraduationCap, label: 'Entrenar IA' },
];

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_expanded');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsExpanded((prev: boolean) => {
      const next = !prev;
      localStorage.setItem('sidebar_expanded', JSON.stringify(next));
      return next;
    });
  };

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
    },
  });

  const changeTheme = (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    void api.patch('/api/auth/me', { theme: t }).catch(() => {});
  };

  const isActive = (href: string) =>
    href === '/' ? location === '/' || location.startsWith('/c/') : location.startsWith(href);

  const SidebarItem = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const active = isActive(href);
    const content = (
      <Link
        href={href}
        className={cn(
          'flex h-9 items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          isExpanded ? 'w-full px-3 gap-3 justify-start' : 'w-9 justify-center',
          active && 'bg-accent/12 text-accent',
        )}
        aria-label={label}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {isExpanded && (
          <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            {label}
          </span>
        )}
      </Link>
    );

    if (isExpanded) {
      return content;
    }

    return <Tooltip label={label}>{content}</Tooltip>;
  };

  return (
    <div className="flex h-full">
      {/* Sidebar colapsable/expandible */}
      <aside 
        className={cn(
          "flex shrink-0 flex-col border-r bg-card py-3 transition-all duration-300",
          isExpanded ? "w-56 px-4 items-stretch" : "w-14 px-0 items-center"
        )}
      >
        <div className={cn("mb-6 flex items-center", isExpanded ? "px-2 justify-between" : "justify-center")}>
          <Link href="/" className="flex items-center gap-2 rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="CRM TOI Logo" className="h-8 w-8 object-contain" />
            {isExpanded && (
              <span className="font-bold text-lg text-foreground tracking-tight">TOI</span>
            )}
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, icon, label }) => (
            <SidebarItem key={href} href={href} icon={icon} label={label} />
          ))}
          {user.role === 'admin' && (
            <SidebarItem href="/ajustes" icon={Settings} label="Configuración" />
          )}

          {/* Botón para contraer/expandir al final de la navegación */}
          <button
            onClick={toggleSidebar}
            className={cn(
              "mt-auto flex h-9 items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
              isExpanded ? "w-full px-3 gap-3 justify-start" : "w-9 justify-center"
            )}
            aria-label={isExpanded ? "Contraer menú" : "Expandir menú"}
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
                <span className="text-sm font-medium">Contraer</span>
              </>
            ) : (
              <ChevronRight className="h-[18px] w-[18px] shrink-0" />
            )}
          </button>
        </nav>

        <div className={cn("mt-4", isExpanded ? "px-1" : "")}>
          <Dropdown>
            <DropdownTrigger asChild>
              <button 
                aria-label="Menú de usuario" 
                className={cn(
                  "rounded-xl ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-center transition-all hover:bg-muted/50",
                  isExpanded ? "w-full p-1.5 gap-3 text-left" : "h-9 w-9 justify-center"
                )}
              >
                <Avatar name={user.name} size="sm" className="shrink-0" />
                {isExpanded && (
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">{user.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
                  </div>
                )}
              </button>
            </DropdownTrigger>
            <DropdownContent side={isExpanded ? "top" : "right"} align={isExpanded ? "start" : "end"} className="w-56">
              <DropdownLabel>
                {user.name}
                <div className="font-normal">{user.email}</div>
              </DropdownLabel>
              <DropdownSeparator />
              <DropdownLabel>Tema</DropdownLabel>
              <DropdownItem onSelect={() => changeTheme('light')}>
                <Sun className="h-4 w-4" /> Claro {theme === 'light' && '✓'}
              </DropdownItem>
              <DropdownItem onSelect={() => changeTheme('dark')}>
                <Moon className="h-4 w-4" /> Oscuro {theme === 'dark' && '✓'}
              </DropdownItem>
              <DropdownItem onSelect={() => changeTheme('system')}>
                <Monitor className="h-4 w-4" /> Sistema {theme === 'system' && '✓'}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onSelect={() => logout.mutate()} className="text-destructive">
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
