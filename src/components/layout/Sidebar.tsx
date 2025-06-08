'use client';

import clsx from 'clsx';
import { LayoutDashboard, Users, Settings, Contact } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';
import { LetterFx } from '@/components/ui/LetterFx';
import { useUser } from '@/contexts/UserContext';

type ViewPath = {
  dashboard: '/dashboard';
  enginecontrol: '/enginecontrol';
  campaigns: '/campaigns';
  leads: '/leads';
  senders: '/senders';
  crm: '/crm';
  settings: '/settings';
};

interface MenuItem {
  view: keyof ViewPath;
  icon: React.ReactElement;
  label: string;
}

const menuItems: MenuItem[] = [
  { view: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { view: 'enginecontrol', icon: <Settings size={20} />, label: 'Engine Control' },
  { view: 'campaigns', icon: <Settings size={20} />, label: 'Campaigns' },
  { view: 'leads', icon: <Users size={20} />, label: 'Upload Leads' },
  { view: 'crm', icon: <Contact size={20} />, label: 'CRM' },
  { view: 'senders', icon: <Settings size={20} />, label: 'Senders' },
  { view: 'settings', icon: <Settings size={20} />, label: 'Settings' },
];

const Sidebar: React.FC = () => {
  const { role, user } = useUser(); // Get role and loading state
  const [companyName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const handleLogoError = () => setLogoError(true);
  const pathname = usePathname();

  // Map CrmView to route paths
  const viewToPath: ViewPath = {
    dashboard: '/dashboard',
    enginecontrol: '/enginecontrol',
    campaigns: '/campaigns',
    leads: '/leads',
    senders: '/senders',
    crm: '/crm',
    settings: '/settings'
  };

  const getFilteredMenuItems = () => {
    if (!role) {
      return []; // No role, no menu items
    }
  
    if (role === 'superadmin') {
      return menuItems; // Superadmin sees all items
    } else {
      // For any other role (not superadmin), show only CRM and Dashboard
      return menuItems.filter(item => item.view === 'crm' || item.view === 'dashboard');
    }
  };

  const visibleMenuItems = getFilteredMenuItems();

  // If no user (e.g. logout initiated, session cleared but component still briefly rendered)
  // or if no visible menu items for the role (e.g. 'guest' role somehow gets here)
  if (!user || visibleMenuItems.length === 0) {
    // This case should ideally not be hit if RequireAuth and UserProvider work correctly.
    // It's a fallback. Consider if a minimal sidebar (e.g. just logo and logout) is better.
    return (
        <aside className="bg-base-200 text-base-content w-64 min-h-screen p-4 flex flex-col">
            <div className="flex items-center justify-center mb-8">
                <Image src={'/logo.png'} alt={'Company Logo'} width={210} height={197} priority />
            </div>
            <div className="mt-auto">
                <p className="text-xs text-center text-base-content/70">
                &copy; {new Date().getFullYear()} {companyName || 'True Soul Partners'}
                </p>
            </div>
      </aside>
    );
  }

  return (
    <aside className="bg-base-200 text-base-content w-64 min-h-screen p-4 flex flex-col">
      <div className="flex items-center justify-center mb-8">
        {logoError ? (
          <div className="text-2xl font-bold text-primary">
            {companyName || 'True Soul Partners LLC'}
          </div>
        ) : (
          <Image 
            src={process.env.NEXT_PUBLIC_APP_LOGO || '/logo.png'}
            alt="Company Logo"
            width={210}
            height={197}
            priority
            onError={handleLogoError}
          />
        )}
      </div>
      <ul className="menu space-y-2 flex-1">
        {visibleMenuItems.map((item) => (
          <li key={item.view}>
            <Link
              href={viewToPath[item.view]}
              className={clsx(
                'flex items-center p-3 rounded-lg hover:bg-primary hover:text-primary-content transition-colors duration-200 w-full no-underline text-base',
                pathname === viewToPath[item.view] ? 'bg-primary text-primary-content font-semibold' : 'text-base-content'
              )}
            >
              {item.icon}
              <LetterFx trigger="hover" speed="fast" className="ml-3">
                {item.label}
              </LetterFx>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <p className="text-xs text-center text-base-content/50">
          &copy; {new Date().getFullYear()} {companyName || 'True Soul Partners LLC'}
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
