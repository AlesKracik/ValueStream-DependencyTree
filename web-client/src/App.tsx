import { useState } from 'react';
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

import { useDashboardData } from './hooks/useDashboardData';
import { DashboardProvider } from './contexts/DashboardContext';
import type { DashboardViewState } from './types/models';
import './App.css';

function DashboardRouteWrapper({ dashboardState, dashboardViewState, setDashboardViewState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
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
      onNavigateToSprint={(id) => navigate(`/sprint/${id}`)}
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
  if (dashboardState.loading) return <div style={{ color: 'white', padding: '24px' }}>Loading settings...</div>;
  return (
    <SettingsPage 
      settings={dashboardState.data?.settings || {}} 
      onUpdateSettings={dashboardState.updateSettings} 
      data={dashboardState.data} 
      updateEpic={dashboardState.updateEpic} 
      addEpic={dashboardState.addEpic} 
    />
  );
}

function App() {
  const dashboardState = useDashboardData();
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

  return (
    <DashboardProvider value={{ data: dashboardState.data, updateEpic: dashboardState.updateEpic }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboards" replace />} />
          
          <Route element={<Layout />}>
            {/* List Pages */}
            <Route path="/dashboards" element={<DashboardListPage data={dashboardState.data} loading={dashboardState.loading} />} />
            <Route path="/dashboard/new" element={<DashboardEditPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/customers" element={<CustomerListPage data={dashboardState.data} loading={dashboardState.loading} />} />
            <Route path="/workitems" element={<WorkItemListPage data={dashboardState.data} loading={dashboardState.loading} />} />
            <Route path="/teams" element={<TeamListPage data={dashboardState.data} loading={dashboardState.loading} />} />
            <Route path="/sprints" element={<SprintPageRouteWrapper dashboardState={dashboardState} />} />
            
            {/* Other Pages */}
            <Route path="/settings" element={<SettingsPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/documentation" element={<DocumentationPage />} />

            {/* Entity Detail Pages */}
            <Route path="/dashboard/:id" element={
              <ReactFlowProvider>
                <DashboardRouteWrapper dashboardState={dashboardState} dashboardViewState={dashboardViewState} setDashboardViewState={setDashboardViewState} />
              </ReactFlowProvider>
            } />
            <Route path="/dashboard/edit/:id" element={<DashboardEditPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/customer/:id" element={<CustomerPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/workitem/:id" element={<WorkItemPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/epic/:id" element={<EpicPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/team/:id" element={<TeamPageRouteWrapper dashboardState={dashboardState} />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DashboardProvider>
  );
}

export default App;
