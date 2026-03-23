import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

// Main entities
import { ValueStream } from './components/valuestream/ValueStream';
import { CustomerPage } from './components/customers/CustomerPage';
import { WorkItemPage } from './components/workitems/WorkItemPage';
import { IssuePage } from './components/issues/IssuePage';
import { TeamPage } from './components/teams/TeamPage';
import { SprintPage } from './components/sprints/SprintPage';

// Layout & List Pages
import { Layout } from './components/layout/Layout';
import { ValueStreamListPage } from './pages/ValueStreamListPage';
import { ValueStreamEditPage } from './pages/ValueStreamEditPage';
import { CustomerListPage } from './pages/CustomerListPage';
import { WorkItemListPage } from './pages/WorkItemListPage';
import { TeamListPage } from './pages/TeamListPage';
import { SettingsPage, DEFAULT_SETTINGS } from './pages/SettingsPage';
import { DocumentationPage } from './pages/DocumentationPage';
import { SupportPage } from './pages/SupportPage';
import { LoginPage } from './pages/LoginPage';

import { useValueStreamData } from './hooks/useValueStreamData';
import { ValueStreamProvider, NotificationProvider, useNotificationContext, useValueStreamContext } from './contexts/ValueStreamContext';
import { getAdminSecret } from './utils/api';
import { deepMerge } from './utils/businessLogic';
import type { ValueStreamDataState } from './types/models';
import './App.css';

function ValueStreamRouteWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert, viewState, setViewState } = useValueStreamContext();
  // Backend applies the ValueStream's saved (static) parameters as hard filters.
  // Dynamic/transient filters are applied client-side in useGraphLayout.
  const valueStreamState = useValueStreamData(id, undefined, 1000, showAlert);

  return (
    // Provide graph view's data + mutations to context so GanttBarNode can access them
    <ValueStreamProvider value={{
      data: valueStreamState.data,
      updateIssue: valueStreamState.updateIssue,
      addIssue: valueStreamState.addIssue,
      deleteIssue: valueStreamState.deleteIssue
    }}>
      <ValueStream
        {...valueStreamState}
        currentValueStreamId={id}
        viewState={viewState}
        setViewState={setViewState}
        onNavigateToCustomer={(id) => navigate(`/customer/${id}`)}
        onNavigateToWorkItem={(id) => navigate(`/workitem/${id}`)}
        onNavigateToIssue={(id) => navigate(`/issue/${id}`)}
        onNavigateToTeam={(id) => navigate(`/team/${id}`)}
        onNavigateToSprint={(id) => id === 'list' ? navigate('/sprints') : navigate(`/sprint/${id}`)}
        onNavigateToValueStreamEdit={(id) => navigate(`/valueStream/edit/${id}`)}
      />
    </ValueStreamProvider>
  );
}

function CustomerPageRouteWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['customers', 'workItems', 'issues', 'settings']);
  return <CustomerPage customerId={id!} onBack={() => navigate(-1)} {...state} addCustomer={state.addCustomer} />;
}

function WorkItemPageRouteWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useNotificationContext();
  // Filter issues to only those linked to this workItem
  const queryParams = useMemo(() => id ? { issues: { workItemId: id } } : {}, [id]);
  const state = useValueStreamData(undefined, undefined, 1000, showAlert,
    ['workItems', 'customers', 'teams', 'sprints', 'issues', 'settings'], queryParams);
  return <WorkItemPage workItemId={id!} onBack={() => navigate(-1)} {...state} />;
}

function IssuePageRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['issues', 'teams', 'workItems', 'sprints', 'settings']);
  return <IssuePage data={state.data} loading={state.loading} updateIssue={state.updateIssue} deleteIssue={state.deleteIssue} />;
}

function TeamPageRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['teams', 'sprints']);
  return <TeamPage data={state.data} loading={state.loading} updateTeam={state.updateTeam} addTeam={state.addTeam as never} deleteTeam={state.deleteTeam} />;
}

function ValueStreamEditPageRouteWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['valueStreams', 'sprints']);
  return <ValueStreamEditPage valueStreamId={id!} onBack={() => navigate(-1)} {...state} />;
}

function SprintPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return <SprintPage {...valueStreamState} />;
}

function SettingsPageRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['settings', 'issues']);
  const mergedSettings = deepMerge(DEFAULT_SETTINGS, state.data?.settings || {});

  return (
    <SettingsPage
      settings={mergedSettings}
      onUpdateSettings={state.data ? state.updateSettings : () => {}}
      data={state.data}
      loading={state.loading}
      error={state.error}
      updateIssue={state.updateIssue}
      addIssue={state.addIssue}
    />
  );
}

// Lightweight wrappers for list pages — fetch only the collections they need
function ValueStreamListRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['valueStreams']);
  return <ValueStreamListPage data={state.data} loading={state.loading} />;
}

function CustomerListRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['customers']);
  return <CustomerListPage data={state.data} loading={state.loading} />;
}

function TeamListRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['teams']);
  return <TeamListPage data={state.data} loading={state.loading} />;
}

function SupportRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['customers', 'settings']);
  return <SupportPage data={state.data} loading={state.loading} updateCustomer={state.updateCustomer} />;
}

function SprintListRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['sprints', 'settings']);
  return <SprintPageRouteWrapper valueStreamState={state} />;
}

function WorkItemListRouteWrapper() {
  const { showAlert } = useNotificationContext();
  // WorkItems list needs cross-entity scoring (customers + issues for TCV/effort)
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['workItems']);
  return <WorkItemListPage data={state.data} loading={state.loading} />;
}

function ValueStreamNewRouteWrapper() {
  const { showAlert } = useNotificationContext();
  const state = useValueStreamData(undefined, undefined, 1000, showAlert, ['valueStreams', 'sprints']);
  return <ValueStreamEditPage valueStreamId="new" onBack={() => window.history.back()} {...state} />;
}

function MainAppContent() {
  const { showAlert } = useNotificationContext();
  // Lightweight settings-only fetch for theme initialization
  const settingsState = useValueStreamData(undefined, undefined, 1000, showAlert, ['settings']);

  useEffect(() => {
    const theme = settingsState.data?.settings?.general?.theme;
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [settingsState.data?.settings?.general?.theme]);

  return (
    <ValueStreamProvider value={{}}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/valueStreams" replace />} />

          <Route element={<Layout />}>
            {/* List Pages — granular fetching */}
            <Route path="/valueStreams" element={<ValueStreamListRouteWrapper />} />
            <Route path="/customers" element={<CustomerListRouteWrapper />} />
            <Route path="/teams" element={<TeamListRouteWrapper />} />
            <Route path="/workitems" element={<WorkItemListRouteWrapper />} />
            <Route path="/support" element={<SupportRouteWrapper />} />
            <Route path="/sprints" element={<SprintListRouteWrapper />} />

            {/* Other Pages */}
            <Route path="/valueStream/new" element={<ValueStreamNewRouteWrapper />} />
            <Route path="/settings" element={<SettingsPageRouteWrapper />} />
            <Route path="/documentation" element={<DocumentationPage />} />

            {/* Entity Detail Pages — granular cross-entity fetching */}
            <Route path="/valueStream/:id" element={
              <ReactFlowProvider>
                <ValueStreamRouteWrapper />
              </ReactFlowProvider>
            } />
            <Route path="/valueStream/edit/:id" element={<ValueStreamEditPageRouteWrapper />} />
            <Route path="/customer/:id" element={<CustomerPageRouteWrapper />} />
            <Route path="/workitem/:id" element={<WorkItemPageRouteWrapper />} />
            <Route path="/issue/:id" element={<IssuePageRouteWrapper />} />
            <Route path="/team/:id" element={<TeamPageRouteWrapper />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ValueStreamProvider>
  );
}

function App() {
  const [authStatus, setAuthStatus] = useState<{ loading: boolean; required: boolean; authenticated: boolean }>({
    loading: true,
    required: false,
    authenticated: false
  });

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/status');
        const json = await res.json();
        const required = json.required;
        const secret = getAdminSecret();
        
        // If required, we also need to check if the current secret is valid
        let authenticated = !required;
        if (required && secret) {
          const verifyRes = await fetch('/api/auth/status', {
            headers: { 'Authorization': `Bearer ${secret}` }
          });
          authenticated = verifyRes.ok;
        }

        setAuthStatus({ loading: false, required, authenticated });
      } catch (err) {
        console.error('Auth check failed', err);
        setAuthStatus({ loading: false, required: false, authenticated: true }); // Fallback to allow dev
      }
    }
    checkAuth();
  }, []);

  if (authStatus.loading) {
    return <div style={{ backgroundColor: 'var(--bg-page)', height: '100vh', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (authStatus.required && !authStatus.authenticated) {
    return <LoginPage onLogin={() => setAuthStatus(prev => ({ ...prev, authenticated: true }))} />;
  }

  return (
    <NotificationProvider>
      <MainAppContent />
    </NotificationProvider>
  );
}

export default App;
