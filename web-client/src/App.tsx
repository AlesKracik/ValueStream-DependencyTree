import { useState, useEffect } from 'react';
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
import { LoginPage } from './pages/LoginPage';

import { useValueStreamData } from './hooks/useValueStreamData';
import { ValueStreamProvider, NotificationProvider, useNotificationContext, useValueStreamContext } from './contexts/ValueStreamContext';
import { getAdminSecret } from './utils/api';
import type { ValueStreamViewState } from './types/models';
import './App.css';

function ValueStreamRouteWrapper({ ValueStreamViewState, setValueStreamViewState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useValueStreamContext();
  // Fetch specific ValueStream data with server-side filtering
  const ValueStreamstate = useValueStreamData(id, {
    customerFilter: ValueStreamViewState.customerFilter,
    workItemFilter: ValueStreamViewState.workItemFilter,
    releasedFilter: ValueStreamViewState.releasedFilter,
    minTcvFilter: ValueStreamViewState.minTcvFilter,
    minScoreFilter: ValueStreamViewState.minScoreFilter,
    teamFilter: ValueStreamViewState.teamFilter,
    epicFilter: ValueStreamViewState.epicFilter
  }, 1000, showAlert);

  return (
    <ValueStream
      {...ValueStreamstate}
      currentValueStreamId={id}
      viewState={ValueStreamViewState}
      setViewState={setValueStreamViewState}
      onNavigateToCustomer={(id) => navigate(`/customer/${id}`)}
      onNavigateToWorkItem={(id) => navigate(`/workitem/${id}`)}
      onNavigateToEpic={(id) => navigate(`/epic/${id}`)}
      onNavigateToTeam={(id) => navigate(`/team/${id}`)}
      onNavigateToSprint={(id) => id === 'list' ? navigate('/sprints') : navigate(`/sprint/${id}`)}
      onNavigateToValueStreamEdit={(id) => navigate(`/ValueStream/edit/${id}`)}
      />
      );
}

function CustomerPageRouteWrapper({ ValueStreamstate }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <CustomerPage customerId={id!} onBack={() => navigate(-1)} addCustomer={ValueStreamstate.addCustomer} {...ValueStreamstate} />;
}

function WorkItemPageRouteWrapper({ ValueStreamstate }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <WorkItemPage workItemId={id!} onBack={() => navigate(-1)} {...ValueStreamstate} />;
}

function EpicPageRouteWrapper({ ValueStreamstate }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <EpicPage epicId={id!} onBack={() => navigate(-1)} {...ValueStreamstate} />;
}

function TeamPageRouteWrapper({ ValueStreamstate }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <TeamPage teamId={id!} onBack={() => navigate(-1)} {...ValueStreamstate} />;
}

function ValueStreamEditPageRouteWrapper({ ValueStreamstate }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <ValueStreamEditPage ValueStreamId={id!} onBack={() => navigate(-1)} {...ValueStreamstate} />;
}

function SprintPageRouteWrapper({ ValueStreamstate }: any) {
  return <SprintPage {...ValueStreamstate} />;
}

function SettingsPageRouteWrapper({ ValueStreamstate }: any) {
  return (
    <SettingsPage 
      settings={ValueStreamstate.data?.settings || { jira_base_url: '', jira_api_version: '3' }} 
      onUpdateSettings={ValueStreamstate.updateSettings} 
      data={ValueStreamstate.data} 
      loading={ValueStreamstate.loading}
      error={ValueStreamstate.error}
      updateEpic={ValueStreamstate.updateEpic} 
      addEpic={ValueStreamstate.addEpic} 
    />
  );
}

function MainAppContent() {
  const [ValueStreamViewState, setValueStreamViewState] = useState<ValueStreamViewState>({
    sprintOffset: 0,
    customerFilter: '',
    workItemFilter: '',
    releasedFilter: 'all',
    minTcvFilter: '',
    minScoreFilter: '',
    teamFilter: '',
    epicFilter: '',
    showDependencies: false,
    disableHoverHighlight: true,
    isInitialOffsetSet: false,
  });

  const { showAlert } = useNotificationContext();
  const globalState = useValueStreamData(undefined, undefined, 1000, showAlert);

  return (
    <ValueStreamProvider value={{ data: globalState.data, updateEpic: globalState.updateEpic }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/ValueStreams" replace />} />
          
          <Route element={<Layout />}>
            {/* List Pages */}
            <Route path="/ValueStreams" element={<ValueStreamListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/ValueStream/new" element={<ValueStreamEditPage ValueStreamId="new" onBack={() => window.history.back()} {...globalState} />} />
            <Route path="/customers" element={<CustomerListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/workitems" element={<WorkItemListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/teams" element={<TeamListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/sprints" element={<SprintPageRouteWrapper ValueStreamstate={globalState} />} />
            
            {/* Other Pages */}
            <Route path="/settings" element={<SettingsPageRouteWrapper ValueStreamstate={globalState} />} />
            <Route path="/documentation" element={<DocumentationPage />} />

            {/* Entity Detail Pages */}
            <Route path="/ValueStream/:id" element={
              <ReactFlowProvider>
                <ValueStreamRouteWrapper ValueStreamViewState={ValueStreamViewState} setValueStreamViewState={setValueStreamViewState} />
              </ReactFlowProvider>
            } />
            <Route path="/ValueStream/edit/:id" element={<ValueStreamEditPageRouteWrapper ValueStreamstate={globalState} />} />
            <Route path="/customer/:id" element={<CustomerPageRouteWrapper ValueStreamstate={globalState} />} />
            <Route path="/workitem/:id" element={<WorkItemPageRouteWrapper ValueStreamstate={globalState} />} />
            <Route path="/epic/:id" element={<EpicPageRouteWrapper ValueStreamstate={globalState} />} />
            <Route path="/team/:id" element={<TeamPageRouteWrapper ValueStreamstate={globalState} />} />
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





