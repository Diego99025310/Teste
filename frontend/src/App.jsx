import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import DashboardMaster from './pages/DashboardMaster.jsx';
import DashboardInfluencer from './pages/DashboardInfluencer.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard/master" element={<DashboardMaster />} />
      <Route path="/dashboard/influencer" element={<DashboardInfluencer />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
