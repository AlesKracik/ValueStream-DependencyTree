import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

// Main entities
import { ValueStream } from './components/valuestream/ValueStream';
import { CustomerPage } from './components/customers/CustomerPage';
import { WorkItemPage } from './components/workitems/WorkItemPage';
import { EpicPage } from './components/epics/EpicPage';
import { TeamPage } from './components/teams/TeamPage';
import { SprintPage } from './components/sprints/SprintPage';

// Layout & List Pages
import { Layout } from './components/layout/Layout';
import { ValueStreamListPage } from './pages/ValueStreamListPage';
import { ValueStreamEditPage } from './pages/ValueStreamEditPage';
import { CustomerListPage } from './pages/CustomerListPage';
import { WorkItemListPage } from './pages/WorkItemListPage';
import { TeamListPage } from './pages/TeamListPage';
import { SettingsPage } from './pages/SettingsPage';
import { DocumentationPage } from './pages/DocumentationPage';
import { SupportPage } from './pages/SupportPage';
import { LoginPage } from './pages/LoginPage';

import { useValueStreamData } from './hooks/useValueStreamData';
import { ValueStreamProvider, NotificationProvider, useNotificationContext, useValueStreamContext } from './contexts/ValueStreamContext';
import { getAdminSecret } from './utils/api';
import type { ValueStreamViewState, ValueStreamDataState } from './types/models';
import './App.css';

function ValueStreamRouteWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert, viewState, setViewState } = useValueStreamContext();
  // Fetch specific ValueStream data with server-side filtering
  const valueStreamState = useValueStreamData(id, {
    customerFilter: viewState.customerFilter,
    workItemFilter: viewState.workItemFilter,
    releasedFilter: viewState.releasedFilter,
    minTcvFilter: viewState.minTcvFilter,
    minScoreFilter: viewState.minScoreFilter,
    teamFilter: viewState.teamFilter,
    epicFilter: viewState.epicFilter
  }, 1000, showAlert);

  return (
    <ValueStream
      {...valueStreamState}
      currentValueStreamId={id}
      viewState={viewState}
      setViewState={setViewState}
      onNavigateToCustomer={(id) => navigate(`/customer/${id}`)}
      onNavigateToWorkItem={(id) => navigate(`/workitem/${id}`)}
      onNavigateToEpic={(id) => navigate(`/epic/${id}`)}
      onNavigateToTeam={(id) => navigate(`/team/${id}`)}
      onNavigateToSprint={(id) => id === 'list' ? navigate('/sprints') : navigate(`/sprint/${id}`)}
      onNavigateToValueStreamEdit={(id) => navigate(`/valueStream/edit/${id}`)}
      />
      );
}

function CustomerPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <CustomerPage customerId={id!} onBack={() => navigate(-1)} addCustomer={valueStreamState.addCustomer} {...valueStreamState} />;
}

function WorkItemPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <WorkItemPage workItemId={id!} onBack={() => navigate(-1)} {...valueStreamState} />;
}

function EpicPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <EpicPage epicId={id!} onBack={() => navigate(-1)} deleteEpic={valueStreamState.deleteEpic} {...valueStreamState} />;
}

function TeamPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <TeamPage teamId={id!} onBack={() => navigate(-1)} deleteTeam={valueStreamState.deleteTeam} {...valueStreamState} />;
}

function ValueStreamEditPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <ValueStreamEditPage valueStreamId={id!} onBack={() => navigate(-1)} {...valueStreamState} />;
}

function SprintPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return <SprintPage {...valueStreamState} />;
}

function SettingsPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return (
    <SettingsPage 
      settings={valueStreamState.data?.settings || { 
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
          mongo: { 
            app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
            customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
          }
        },
        jira: { base_url: '', api_version: '3' },
        ai: { provider: 'openai' }
      }} 
      onUpdateSettings={valueStreamState.updateSettings} 
      data={valueStreamState.data} 
      loading={valueStreamState.loading}
      error={valueStreamState.error}
      updateEpic={valueStreamState.updateEpic} 
      addEpic={valueStreamState.addEpic} 
    />
  );
}

function MainAppContent() {
  const { showAlert } = useNotificationContext();
  const globalState = useValueStreamData(undefined, undefined, 1000, showAlert);

  useEffect(() => {
    const theme = globalState.data?.settings?.general?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [globalState.data?.settings?.general?.theme]);

  return (
    <ValueStreamProvider value={{ 
      data: globalState.data, 
      updateEpic: globalState.updateEpic,
      addEpic: globalState.addEpic,
      deleteEpic: globalState.deleteEpic
    }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/valueStreams" replace />} />
          
          <Route element={<Layout />}>
            {/* List Pages */}
            <Route path="/valueStreams" element={<ValueStreamListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/valueStream/new" element={<ValueStreamEditPage valueStreamId="new" onBack={() => window.history.back()} {...globalState} />} />
            <Route path="/customers" element={<CustomerListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/workitems" element={<WorkItemListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/teams" element={<TeamListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/support" element={<SupportPage data={globalState.data} loading={globalState.loading} updateCustomer={globalState.updateCustomer} />} />
            <Route path="/sprints" element={<SprintPageRouteWrapper valueStreamState={globalState} />} />
            
            {/* Other Pages */}
            <Route path="/settings" element={<SettingsPageRouteWrapper valueStreamState={globalState} />} />
            <Route path="/documentation" element={<DocumentationPage />} />

            {/* Entity Detail Pages */}
            <Route path="/valueStream/:id" element={
              <ReactFlowProvider>
                <ValueStreamRouteWrapper />
              </ReactFlowProvider>
            } />
            <Route path="/valueStream/edit/:id" element={<ValueStreamEditPageRouteWrapper valueStreamState={globalState} />} />
            <Route path="/customer/:id" element={<CustomerPageRouteWrapper valueStreamState={globalState} />} />
            <Route path="/workitem/:id" element={<WorkItemPageRouteWrapper valueStreamState={globalState} />} />
            <Route path="/epic/:id" element={<EpicPageRouteWrapper valueStreamState={globalState} />} />
            <Route path="/team/:id" element={<TeamPageRouteWrapper valueStreamState={globalState} />} />
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
    return <div style={{ backgroundColor: '#111827', height: '100vh', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
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





