import React from 'react';
import Sidebar from '../components/Sidebar.jsx';

export function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-soft via-white to-pink-soft px-4 py-6 text-ink md:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row">
        <Sidebar />
        <main className="flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}

export default DashboardLayout;
