import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import DashboardMaster from './pages/DashboardMaster.jsx';
import DashboardInfluencer from './pages/DashboardInfluencer.jsx';
import { getStoredRole, getToken } from './services/api.js';

function RequireAuth({ children, allowedRoles }) {
  const token = getToken();
  const role = getStoredRole();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && allowedRoles.length && role && !allowedRoles.includes(role)) {
    const fallback = role === 'master' ? '/dashboard/master' : '/dashboard/influencer';
    return <Navigate to={fallback} replace />;
  }
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard/master"
        element={
          <RequireAuth allowedRoles={['master']}>
            <DashboardMaster />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/influencer"
        element={
          <RequireAuth allowedRoles={['influencer']}>
            <DashboardInfluencer />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
