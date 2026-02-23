import { useState } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { CustomerPage } from './components/customers/CustomerPage';
import { FeaturePage } from './components/features/FeaturePage';
import { EpicPage } from './components/epics/EpicPage';
import { TeamPage } from './components/teams/TeamPage';
import { useDashboardData } from './hooks/useDashboardData';
import type { DashboardViewState } from './types/models';
import './App.css';

function App() {
  const dashboardState = useDashboardData();
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [activeEpicId, setActiveEpicId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [dashboardViewState, setDashboardViewState] = useState<DashboardViewState>({
    sprintOffset: 0,
    customerFilter: '',
    featureFilter: '',
    minTcvFilter: '',
    minScoreFilter: '',
    teamFilter: '',
    epicFilter: '',
    showDependencies: false,
  });

  return (
    <div className="app-container">
      {activeCustomerId ? (
        <CustomerPage
          customerId={activeCustomerId}
          onBack={() => setActiveCustomerId(null)}
          {...dashboardState}
        />
      ) : activeFeatureId ? (
        <FeaturePage
          featureId={activeFeatureId}
          onBack={() => setActiveFeatureId(null)}
          {...dashboardState}
        />
      ) : activeEpicId ? (
        <EpicPage
          epicId={activeEpicId}
          onBack={() => setActiveEpicId(null)}
          {...dashboardState}
        />
      ) : activeTeamId ? (
        <TeamPage
          teamId={activeTeamId}
          onBack={() => setActiveTeamId(null)}
          {...dashboardState}
        />
      ) : (
        <Dashboard
          {...dashboardState}
          viewState={dashboardViewState}
          setViewState={setDashboardViewState}
          onNavigateToCustomer={setActiveCustomerId}
          onNavigateToFeature={setActiveFeatureId}
          onNavigateToEpic={setActiveEpicId}
          onNavigateToTeam={setActiveTeamId}
        />
      )}
    </div>
  );
}

export default App;
