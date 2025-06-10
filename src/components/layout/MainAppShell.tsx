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
      // Directly toggle the checkbox which controls the drawer's visibility
      drawerCheckbox.checked = !drawerCheckbox.checked;
    }
  };

  return (
    <div className="drawer">
      <input id="sidebar-drawer-toggle" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content">
        <Navbar onMenuClick={toggleMobileSidebar} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-base-100">
          {children}
        </main>
      </div>
      <Sidebar />
      <label htmlFor="sidebar-drawer-toggle" aria-label="close sidebar" className="drawer-overlay"></label>
    </div>
  );
};

export default MainAppShell;