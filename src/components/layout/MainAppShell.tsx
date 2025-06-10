'use client';

import React from 'react'; // Removed useState as drawer toggle is CSS-based
import Navbar from './Navbar';
import Sidebar from './Sidebar';

type MainAppShellProps = {
  children?: React.ReactNode;
};

const MainAppShell: React.FC<MainAppShellProps> = ({ children }) => {
  // Drawer toggle is now handled by a checkbox and CSS,
  // but Navbar's onMenuClick needs to trigger this checkbox.
  // We'll use a unique ID for the checkbox.
  const drawerToggleId = "main-sidebar-drawer-toggle";

  const toggleMobileSidebar = () => {
    const drawerCheckbox = document.getElementById(drawerToggleId) as HTMLInputElement | null;
    if (drawerCheckbox) {
      drawerCheckbox.checked = !drawerCheckbox.checked;
    }
  };

  return (
    <div className="drawer lg:drawer-open">
      <input id={drawerToggleId} type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col h-screen">
        {/* Navbar is part of the scrollable content */}
        <div className="sticky top-0 z-30"> {/* Make Navbar sticky */}
          <Navbar onMenuClick={toggleMobileSidebar} />
        </div>
        
        {/* Page content here, styled as a bento item */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-base-100">
          {/* This div is the main "bento box" for the page content itself */}
          <div className="w-full h-full bg-base-200 rounded-lg shadow-md p-4">
             {children}
          </div>
        </main>
      </div>
      <div className="drawer-side">
        <label htmlFor={drawerToggleId} aria-label="close sidebar" className="drawer-overlay"></label>
        {/* Sidebar content here, styled as another bento item */}
        {/* The Sidebar component itself has bg-base-200, so no need to re-apply here unless a different effect is wanted */}
        <Sidebar />
      </div>
    </div>
  );
};

export default MainAppShell;