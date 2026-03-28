import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
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
import { ValueStreamProvider, NotificationProvider, useNotificationContext } from './contexts/ValueStreamContext';
import { UIStateProvider, useUIStateContext } from './contexts/UIStateContext';
import { getAdminSecret } from './utils/api';
import { deepMerge } from './utils/businessLogic';
import type { ValueStreamDataState } from '@valuestream/shared-types';
import './App.css';

// --- Route wrapper factory ---
// Eliminates repetitive useNotificationContext() + useValueStreamData() boilerplate.
type RouteWrapperConfig = {
  collections: string[];
  queryParams?: (id?: string) => Record<string, Record<string, string>> | undefined;
  render: (ctx: {
    state: ReturnType<typeof useValueStreamData>;
    id?: string;
    navigate: NavigateFunction;
  }) => React.ReactElement;
};

function createRouteWrapper(config: RouteWrapperConfig): React.FC {
  return function RouteWrapper() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showAlert } = useNotificationContext();
    const queryParams = config.queryParams?.(id);
    const state = useValueStreamData(undefined, undefined, 1000, showAlert, config.collections, queryParams);
    return config.render({ state, id, navigate });
  };
}

function ValueStreamRouteWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useNotificationContext();
  const { viewState, setViewState } = useUIStateContext();
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

// --- Entity detail page wrappers ---
const CustomerPageRouteWrapper = createRouteWrapper({
  collections: ['customers', 'workItems', 'issues', 'settings'],
  render: ({ state, id, navigate }) =>
    <CustomerPage customerId={id!} onBack={() => navigate(-1)} {...state} addCustomer={state.addCustomer} />,
});

const WorkItemPageRouteWrapper = createRouteWrapper({
  collections: ['workItems', 'customers', 'teams', 'sprints', 'issues', 'settings'],
  // Filter issues to only those linked to this workItem
  queryParams: (id) => id ? { issues: { workItemId: id } } : undefined,
  render: ({ state, id, navigate }) =>
    <WorkItemPage workItemId={id!} onBack={() => navigate(-1)} {...state} />,
});

const IssuePageRouteWrapper = createRouteWrapper({
  collections: ['issues', 'teams', 'workItems', 'sprints', 'settings'],
  render: ({ state }) =>
    <IssuePage data={state.data} loading={state.loading} updateIssue={state.updateIssue} deleteIssue={state.deleteIssue} />,
});

const TeamPageRouteWrapper = createRouteWrapper({
  collections: ['teams', 'sprints', 'settings'],
  render: ({ state }) =>
    <TeamPage data={state.data} loading={state.loading} updateTeam={state.updateTeam} addTeam={state.addTeam as never} deleteTeam={state.deleteTeam} />,
});

const ValueStreamEditPageRouteWrapper = createRouteWrapper({
  collections: ['valueStreams', 'sprints'],
  render: ({ state, id, navigate }) =>
    <ValueStreamEditPage valueStreamId={id!} onBack={() => navigate(-1)} {...state} />,
});

function SprintPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return <SprintPage {...valueStreamState} />;
}

const SettingsPageRouteWrapper = createRouteWrapper({
  collections: ['settings'],
  render: ({ state }) => {
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
  },
});

// --- List page wrappers — fetch only the collections they need ---
const ValueStreamListRouteWrapper = createRouteWrapper({
  collections: ['valueStreams'],
  render: ({ state }) => <ValueStreamListPage data={state.data} loading={state.loading} />,
});

const CustomerListRouteWrapper = createRouteWrapper({
  collections: ['customers'],
  render: ({ state }) => <CustomerListPage data={state.data} loading={state.loading} />,
});

const TeamListRouteWrapper = createRouteWrapper({
  collections: ['teams'],
  render: ({ state }) => <TeamListPage data={state.data} loading={state.loading} />,
});

const SupportRouteWrapper = createRouteWrapper({
  collections: ['customers', 'settings'],
  render: ({ state }) =>
    <SupportPage data={state.data} loading={state.loading} updateCustomer={state.updateCustomer} />,
});

const SprintListRouteWrapper = createRouteWrapper({
  collections: ['sprints', 'settings'],
  render: ({ state }) => <SprintPageRouteWrapper valueStreamState={state} />,
});

// WorkItems list needs sprints so the "Released" column can resolve sprint names
const WorkItemListRouteWrapper = createRouteWrapper({
  collections: ['workItems', 'sprints'],
  render: ({ state }) => <WorkItemListPage data={state.data} loading={state.loading} />,
});

const ValueStreamNewRouteWrapper = createRouteWrapper({
  collections: ['valueStreams', 'sprints'],
  render: ({ state }) =>
    <ValueStreamEditPage valueStreamId="new" onBack={() => window.history.back()} {...state} />,
});

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
    <UIStateProvider>
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
    </UIStateProvider>
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
