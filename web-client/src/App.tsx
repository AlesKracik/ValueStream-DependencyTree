import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

// Main entities
import { Dashboard } from './components/dashboard/Dashboard';
import { CustomerPage } from './components/customers/CustomerPage';
import { WorkItemPage } from './components/workitems/WorkItemPage';
import { EpicPage } from './components/epics/EpicPage';
import { TeamPage } from './components/teams/TeamPage';
import { SprintPage } from './components/sprints/SprintPage';

// Layout & List Pages
import { Layout } from './components/layout/Layout';
import { DashboardListPage } from './pages/DashboardListPage';
import { DashboardEditPage } from './pages/DashboardEditPage';
import { CustomerListPage } from './pages/CustomerListPage';
import { WorkItemListPage } from './pages/WorkItemListPage';
import { TeamListPage } from './pages/TeamListPage';
import { SettingsPage } from './pages/SettingsPage';
import { DocumentationPage } from './pages/DocumentationPage';
import { LoginPage } from './pages/LoginPage';

import { useDashboardData } from './hooks/useDashboardData';
import { DashboardProvider, NotificationProvider, useNotificationContext, useDashboardContext } from './contexts/DashboardContext';
import { getAdminSecret } from './utils/api';
import type { DashboardViewState } from './types/models';
import './App.css';

function DashboardRouteWrapper({ dashboardViewState, setDashboardViewState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useDashboardContext();
  // Fetch specific dashboard data with server-side filtering
  const dashboardState = useDashboardData(id, {
    customerFilter: dashboardViewState.customerFilter,
    workItemFilter: dashboardViewState.workItemFilter,
    releasedFilter: dashboardViewState.releasedFilter,
    minTcvFilter: dashboardViewState.minTcvFilter,
    minScoreFilter: dashboardViewState.minScoreFilter,
    teamFilter: dashboardViewState.teamFilter,
    epicFilter: dashboardViewState.epicFilter
  }, 1000, showAlert);

  return (
    <Dashboard
      {...dashboardState}
      currentDashboardId={id}
      viewState={dashboardViewState}
      setViewState={setDashboardViewState}
      onNavigateToCustomer={(id) => navigate(`/customer/${id}`)}
      onNavigateToWorkItem={(id) => navigate(`/workitem/${id}`)}
      onNavigateToEpic={(id) => navigate(`/epic/${id}`)}
      onNavigateToTeam={(id) => navigate(`/team/${id}`)}
      onNavigateToSprint={(id) => id === 'list' ? navigate('/sprints') : navigate(`/sprint/${id}`)}
      onNavigateToDashboardEdit={(id) => navigate(`/dashboard/edit/${id}`)}
      />
      );
}

function CustomerPageRouteWrapper({ dashboardState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <CustomerPage customerId={id!} onBack={() => navigate(-1)} addCustomer={dashboardState.addCustomer} {...dashboardState} />;
}

function WorkItemPageRouteWrapper({ dashboardState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <WorkItemPage workItemId={id!} onBack={() => navigate(-1)} {...dashboardState} />;
}

function EpicPageRouteWrapper({ dashboardState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <EpicPage epicId={id!} onBack={() => navigate(-1)} {...dashboardState} />;
}

function TeamPageRouteWrapper({ dashboardState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <TeamPage teamId={id!} onBack={() => navigate(-1)} {...dashboardState} />;
}

function DashboardEditPageRouteWrapper({ dashboardState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <DashboardEditPage dashboardId={id!} onBack={() => navigate(-1)} {...dashboardState} />;
}

function SprintPageRouteWrapper({ dashboardState }: any) {
  return <SprintPage {...dashboardState} />;
}

function SettingsPageRouteWrapper({ dashboardState }: any) {
  return (
    <SettingsPage 
      settings={dashboardState.data?.settings || { jira_base_url: '', jira_api_version: '3' }} 
      onUpdateSettings={dashboardState.updateSettings} 
      data={dashboardState.data} 
      loading={dashboardState.loading}
      error={dashboardState.error}
      updateEpic={dashboardState.updateEpic} 
      addEpic={dashboardState.addEpic} 
    />
  );
}

function MainAppContent() {
  const [dashboardViewState, setDashboardViewState] = useState<DashboardViewState>({
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
  const globalState = useDashboardData(undefined, undefined, 1000, showAlert);

  return (
    <DashboardProvider value={{ data: globalState.data, updateEpic: globalState.updateEpic }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboards" replace />} />
          
          <Route element={<Layout />}>
            {/* List Pages */}
            <Route path="/dashboards" element={<DashboardListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/dashboard/new" element={<DashboardEditPage dashboardId="new" onBack={() => window.history.back()} {...globalState} />} />
            <Route path="/customers" element={<CustomerListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/workitems" element={<WorkItemListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/teams" element={<TeamListPage data={globalState.data} loading={globalState.loading} />} />
            <Route path="/sprints" element={<SprintPageRouteWrapper dashboardState={globalState} />} />
            
            {/* Other Pages */}
            <Route path="/settings" element={<SettingsPageRouteWrapper dashboardState={globalState} />} />
            <Route path="/documentation" element={<DocumentationPage />} />

            {/* Entity Detail Pages */}
            <Route path="/dashboard/:id" element={
              <ReactFlowProvider>
                <DashboardRouteWrapper dashboardViewState={dashboardViewState} setDashboardViewState={setDashboardViewState} />
              </ReactFlowProvider>
            } />
            <Route path="/dashboard/edit/:id" element={<DashboardEditPageRouteWrapper dashboardState={globalState} />} />
            <Route path="/customer/:id" element={<CustomerPageRouteWrapper dashboardState={globalState} />} />
            <Route path="/workitem/:id" element={<WorkItemPageRouteWrapper dashboardState={globalState} />} />
            <Route path="/epic/:id" element={<EpicPageRouteWrapper dashboardState={globalState} />} />
            <Route path="/team/:id" element={<TeamPageRouteWrapper dashboardState={globalState} />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DashboardProvider>
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
