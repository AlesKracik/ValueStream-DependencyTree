import { useState } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { CustomerPage } from './components/customers/CustomerPage';
import { useDashboardData } from './hooks/useDashboardData';
import './App.css';

function App() {
  const dashboardState = useDashboardData();
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);

  return (
    <div className="app-container">
      {activeCustomerId ? (
        <CustomerPage
          customerId={activeCustomerId}
          onBack={() => setActiveCustomerId(null)}
          {...dashboardState}
        />
      ) : (
        <Dashboard
          {...dashboardState}
          onNavigateToCustomer={setActiveCustomerId}
        />
      )}
    </div>
  );
}

export default App;
