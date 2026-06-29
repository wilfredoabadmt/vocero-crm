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

export default function App() {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User }>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

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
        <Route path="/ajustes/:section?">{(params) => <SettingsPage section={params.section} user={user} />}</Route>
        <Route>
          <div className="p-10 text-center text-muted-foreground">Página no encontrada</div>
        </Route>
      </Switch>
    </AppShell>
  );
}
