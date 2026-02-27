import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { Dashboard } from './components/dashboard/Dashboard';
import { CustomerPage } from './components/customers/CustomerPage';
import { WorkItemPage } from './components/workitems/WorkItemPage';
import { EpicPage } from './components/epics/EpicPage';
import { TeamPage } from './components/teams/TeamPage';
import { useDashboardData } from './hooks/useDashboardData';
import { DashboardProvider } from './contexts/DashboardContext';
import type { DashboardViewState } from './types/models';
import './App.css';

function DashboardRouteWrapper({ dashboardState, dashboardViewState, setDashboardViewState }: any) {
  const navigate = useNavigate();
  return (
    <Dashboard
      {...dashboardState}
      viewState={dashboardViewState}
      setViewState={setDashboardViewState}
      onNavigateToCustomer={(id) => navigate(`/customer/${id}`)}
      onNavigateToWorkItem={(id) => navigate(`/workitem/${id}`)}
      onNavigateToEpic={(id) => navigate(`/epic/${id}`)}
      onNavigateToTeam={(id) => navigate(`/team/${id}`)}
    />
  );
}

function CustomerPageRouteWrapper({ dashboardState }: any) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <CustomerPage customerId={id!} onBack={() => navigate(-1)} {...dashboardState} />;
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

function App() {
  const dashboardState = useDashboardData();
  const [dashboardViewState, setDashboardViewState] = useState<DashboardViewState>({
    sprintOffset: 0,
    customerFilter: '',
    workItemFilter: '',
    minTcvFilter: '',
    minScoreFilter: '',
    teamFilter: '',
    epicFilter: '',
    showDependencies: false,
  });

  return (
    <div className="app-container">
      <DashboardProvider value={{ data: dashboardState.data, updateEpic: dashboardState.updateEpic }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={
              <ReactFlowProvider>
                <DashboardRouteWrapper dashboardState={dashboardState} dashboardViewState={dashboardViewState} setDashboardViewState={setDashboardViewState} />
              </ReactFlowProvider>
            } />
            <Route path="/customer/:id" element={<CustomerPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/workitem/:id" element={<WorkItemPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/epic/:id" element={<EpicPageRouteWrapper dashboardState={dashboardState} />} />
            <Route path="/team/:id" element={<TeamPageRouteWrapper dashboardState={dashboardState} />} />
          </Routes>
        </BrowserRouter>
      </DashboardProvider>
    </div>
  );
}

export default App;
