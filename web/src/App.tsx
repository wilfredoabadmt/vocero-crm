import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { api } from './lib/api';
import { reconnectRealtime } from './lib/ws';
import type { User } from './lib/types';
import { Spinner } from './components/ui/misc';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { AppShell } from './features/layout/AppShell';
import { InboxPage } from './features/inbox/InboxPage';
import { KanbanPage } from './features/kanban/KanbanPage';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { EducateAiPage } from './features/agents/EducateAiPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { DashboardPage } from './features/analytics/DashboardPage';
import { BroadcastsPage } from './features/broadcasts/BroadcastsPage';
import { TasksPage } from './features/tasks/TasksPage';
import { AlertsPage } from './features/alerts/AlertsPage';
import { LandingPagesPage } from './features/landing-pages/LandingPagesPage';
import { LandingPageView } from './features/landing-pages/LandingPageView';
import { OnboardingTour } from './features/onboarding/OnboardingTour';
import { TrialExpiredOverlay } from './features/onboarding/TrialExpiredOverlay';
import { TrialWelcomePage } from './features/onboarding/TrialWelcomePage';
import { ManualPage } from './features/manual/ManualPage';

export default function App() {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User }>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  interface WhiteLabelData {
    name: string;
    logo: string;
    accent_color: string;
  }

  // Cargar perfil de marca blanca al inicio de la aplicación
  const brand = useQuery({
    queryKey: ['white-label'],
    queryFn: () => api.get<WhiteLabelData>('/api/settings/white-label'),
    staleTime: Infinity,
  });

  const brandData = brand.data;
  useEffect(() => {
    if (brandData) {
      // 1. Cambiar título del explorador
      document.title = brandData.name;
      
      // 2. Cambiar favicon dinámicamente
      const link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (link) {
        link.href = brandData.logo;
      }

      // 3. Convertir HEX del acento a HSL e inyectar en :root
      try {
        const hex = brandData.accent_color;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        const hDeg = Math.round(h * 360);
        const sPct = Math.round(s * 100);
        const lPct = Math.round(l * 100);
        
        document.documentElement.style.setProperty('--accent', `${hDeg} ${sPct}% ${lPct}%`);
      } catch (e) {
        // Fallback silencioso en caso de error en formato HEX
      }
    }
  }, [brandData]);

  // Listener para refrescar la marca en caliente al guardar cambios en Ajustes
  useEffect(() => {
    const handleBrandChanged = (e: Event) => {
      const customEvent = e as CustomEvent<WhiteLabelData>;
      queryClient.setQueryData(['white-label'], customEvent.detail);
    };
    window.addEventListener('brand-settings-changed', handleBrandChanged);
    return () => window.removeEventListener('brand-settings-changed', handleBrandChanged);
  }, [queryClient]);

  useEffect(() => {
    const onExpired = () => queryClient.setQueryData(['me'], null);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, [queryClient]);

  // Al quedar autenticado (login inicial o recién logueado), asegura el WebSocket.
  const userId = me.data?.user?.id;
  useEffect(() => {
    if (userId) reconnectRealtime();
  }, [userId]);

  const [location] = useLocation();

  if (me.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const user = me.data?.user;

  // Rutas públicas (sin autenticación)
  if (location.startsWith('/lp/')) {
    return (
      <Switch>
        <Route path="/lp/:slug">{(params) => <LandingPageView />}</Route>
      </Switch>
    );
  }

  if (!user) {
    if (location === '/register') {
      return <RegisterPage />;
    }
    return <LoginPage />;
  }

  return (
    <AppShell user={user}>
      <OnboardingTour user={user} />
      <TrialExpiredOverlay user={user} />
      <Switch>
        <Route path="/">{() => user.is_trial ? <TrialWelcomePage user={user} /> : <InboxPage />}</Route>
        <Route path="/inbox">{() => <InboxPage />}</Route>
        <Route path="/c/:id">{(params) => <InboxPage conversationId={Number(params.id)} />}</Route>
        <Route path="/kanban" component={KanbanPage} />
        <Route path="/dashboard">{() => user.is_trial ? <TrialWelcomePage user={user} /> : <DashboardPage />}</Route>
        <Route path="/plantillas" component={TemplatesPage} />
        <Route path="/campanas" component={BroadcastsPage} />
        <Route path="/tareas" component={TasksPage} />
        <Route path="/alertas" component={AlertsPage} />
        <Route path="/landing-pages" component={LandingPagesPage} />
        <Route path="/agentes" component={EducateAiPage} />
        <Route path="/manual" component={ManualPage} />
        <Route path="/ajustes/:section?">{(params) => <SettingsPage section={params.section} user={user} />}</Route>
        <Route>
          <div className="p-10 text-center text-muted-foreground">Página no encontrada</div>
        </Route>
      </Switch>
    </AppShell>
  );
}
