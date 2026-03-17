import { useState, useEffect } from 'react';
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
import type { ValueStreamDataState } from './types/models';
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
    issueFilter: viewState.issueFilter
  }, 1000, showAlert);

  return (
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
      );
}

function CustomerPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <CustomerPage customerId={id!} onBack={() => navigate(-1)} {...valueStreamState} addCustomer={valueStreamState.addCustomer} />;
}

function WorkItemPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <WorkItemPage workItemId={id!} onBack={() => navigate(-1)} {...valueStreamState} />;
}

function IssuePageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return <IssuePage data={valueStreamState.data} loading={valueStreamState.loading} updateIssue={valueStreamState.updateIssue} deleteIssue={valueStreamState.deleteIssue} />;
}

function TeamPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return <TeamPage data={valueStreamState.data} loading={valueStreamState.loading} updateTeam={valueStreamState.updateTeam} addTeam={valueStreamState.addTeam as any} deleteTeam={valueStreamState.deleteTeam} />;
}

function ValueStreamEditPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <ValueStreamEditPage valueStreamId={id!} onBack={() => navigate(-1)} {...valueStreamState} />;
}

function SprintPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  return <SprintPage {...valueStreamState} />;
}

function deepMerge<T extends object>(target: T, source: any): T {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target } as any;
  
  Object.keys(target).forEach(key => {
    const targetValue = (target as any)[key];
    const sourceValue = source[key];
    
    if (sourceValue !== undefined) {
      if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue) && 
          sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
  });
  
  return result as T;
}

function SettingsPageRouteWrapper({ valueStreamState }: { valueStreamState: ValueStreamDataState }) {
  const mergedSettings = deepMerge(DEFAULT_SETTINGS, valueStreamState.data?.settings || {});
  
  return (
    <SettingsPage 
      settings={mergedSettings} 
      onUpdateSettings={valueStreamState.data ? valueStreamState.updateSettings : () => {}} 
      data={valueStreamState.data} 
      loading={valueStreamState.loading}
      error={valueStreamState.error}
      updateIssue={valueStreamState.updateIssue} 
      addIssue={valueStreamState.addIssue} 
    />
  );
}

function MainAppContent() {
  const { showAlert } = useNotificationContext();
  const globalState = useValueStreamData(undefined, undefined, 1000, showAlert);

  useEffect(() => {
    const theme = globalState.data?.settings?.general?.theme;
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [globalState.data?.settings?.general?.theme]);

  return (
    <ValueStreamProvider value={{ 
      data: globalState.data, 
      updateIssue: globalState.updateIssue,
      addIssue: globalState.addIssue,
      deleteIssue: globalState.deleteIssue
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
            <Route path="/issue/:id" element={<IssuePageRouteWrapper valueStreamState={globalState} />} />
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
