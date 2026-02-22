import { useState } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { CustomerPage } from './components/customers/CustomerPage';
import { FeaturePage } from './components/features/FeaturePage';
import { useDashboardData } from './hooks/useDashboardData';
import './App.css';

function App() {
  const dashboardState = useDashboardData();
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);

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
      ) : (
        <Dashboard
          {...dashboardState}
          onNavigateToCustomer={setActiveCustomerId}
          onNavigateToFeature={setActiveFeatureId}
        />
      )}
    </div>
  );
}

export default App;
