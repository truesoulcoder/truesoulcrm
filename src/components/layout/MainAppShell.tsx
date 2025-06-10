'use client';

import React from 'react';

import Navbar from './Navbar';
import Sidebar from './Sidebar';

type MainAppShellProps = {
  children?: React.ReactNode;
};

const MainAppShell: React.FC<MainAppShellProps> = ({ children }) => {
  const toggleMobileSidebar = () => {
    const drawerCheckbox = document.getElementById('sidebar-drawer-toggle') as HTMLInputElement | null;
    if (drawerCheckbox) {
      drawerCheckbox.checked = !drawerCheckbox.checked;
    }
  };

  return (
    // The `lg:drawer-open` class makes the drawer responsive.
    <div className="drawer lg:drawer-open">
      <input id="sidebar-drawer-toggle" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col h-screen">
        <Navbar onMenuClick={toggleMobileSidebar} />
        <main className="flex-1 overflow-y-auto bg-base-100 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <div className="drawer-side">
        <label htmlFor="sidebar-drawer-toggle" aria-label="close sidebar" className="drawer-overlay"></label>
        {/* The Sidebar component is placed inside the drawer-side container */}
        <Sidebar />
      </div>
    </div>
  );
};

export default MainAppShell;