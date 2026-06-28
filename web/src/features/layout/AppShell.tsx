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
} from 'lucide-react';
import type { ReactNode } from 'react';
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

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-14 shrink-0 flex-col items-center border-r bg-card py-3">
        <Link href="/" className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden bg-card hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="CRM TOI Logo" className="h-8 w-8 object-contain" />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV.map(({ href, icon: Icon, label }) => (
            <Tooltip key={href} label={label}>
              <Link
                href={href}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isActive(href) && 'bg-accent/12 text-accent',
                )}
                aria-label={label}
              >
                <Icon className="h-[18px] w-[18px]" />
              </Link>
            </Tooltip>
          ))}
          {user.role === 'admin' && (
            <Tooltip label="Configuración">
              <Link
                href="/ajustes"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  location.startsWith('/ajustes') && 'bg-accent/12 text-accent',
                )}
                aria-label="Configuración"
              >
                <Settings className="h-[18px] w-[18px]" />
              </Link>
            </Tooltip>
          )}
        </nav>

        <Dropdown>
          <DropdownTrigger asChild>
            <button aria-label="Menú de usuario" className="rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={user.name} size="sm" />
            </button>
          </DropdownTrigger>
          <DropdownContent side="right" align="end">
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
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
