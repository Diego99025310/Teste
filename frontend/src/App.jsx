import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import MasterHome from './pages/master/MasterHome.jsx';
import MasterCreate from './pages/master/MasterCreate.jsx';
import MasterConsult from './pages/master/MasterConsult.jsx';
import MasterList from './pages/master/MasterList.jsx';
import MasterSales from './pages/master/MasterSales.jsx';
import MasterScripts from './pages/master/MasterScripts.jsx';
import MasterSkuPoints from './pages/master/MasterSkuPoints.jsx';
import InfluencerDashboard from './pages/influencer/InfluencerDashboard.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/master" element={<MasterHome />} />
      <Route path="/master/create" element={<MasterCreate />} />
      <Route path="/master/consult" element={<MasterConsult />} />
      <Route path="/master/list" element={<MasterList />} />
      <Route path="/master/sales" element={<MasterSales />} />
      <Route path="/master/scripts" element={<MasterScripts />} />
      <Route path="/master/sku-points" element={<MasterSkuPoints />} />
      <Route path="/influencer" element={<InfluencerDashboard />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
