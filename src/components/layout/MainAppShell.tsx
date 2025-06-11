'use client';

import React from 'react';
import NavbarNew from './NavbarNew'; // Import NavbarNew

type MainAppShellProps = {
  children?: React.ReactNode;
};

const MainAppShell: React.FC<MainAppShellProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen">
      {/* NavbarNew is sticky at the top */}
      <div className="sticky top-0 z-30">
        <NavbarNew />
      </div>
      
      {/* Page content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-base-100">
        {/* This div is the main "bento box" for the page content itself */}
        {/* Ensure this container allows children to define their own layout, or adjust as needed */}
        <div className="w-full h-full bg-base-200 rounded-lg shadow-md p-4">
           {children}
        </div>
      </main>
    </div>
  );
};

export default MainAppShell;