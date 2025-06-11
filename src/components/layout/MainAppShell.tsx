'use client';

import React from 'react';
import NavbarNew from './NavbarNew';

type MainAppShellProps = {
  children?: React.ReactNode;
};

const MainAppShell: React.FC<MainAppShellProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen bg-base-100">
      {/* The top navigation bar */}
      <NavbarNew />
      
      {/* The main, scrollable content area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="w-full h-full bg-base-200 rounded-lg shadow-md p-4">
           {children}
        </div>
      </main>
    </div>
  );
};

export default MainAppShell;