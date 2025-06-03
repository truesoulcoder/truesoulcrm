'use client';

import clsx from 'clsx';
import { LayoutDashboard, Users, Settings, Contact } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';

import { LetterFx } from '@/components/ui/once-ui/components';
import { useUser } from '@/contexts/UserContext'; // Added UserContext import


type ViewPath = {
  dashboard: '/dashboard';
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
  { view: 'campaigns', icon: <Settings size={20} />, label: 'Campaigns' },
  { view: 'leads', icon: <Users size={20} />, label: 'Upload Leads' },
  { view: 'crm', icon: <Contact size={20} />, label: 'CRM' },
  { view: 'senders', icon: <Settings size={20} />, label: 'Senders' },
  { view: 'settings', icon: <Settings size={20} />, label: 'Settings' },
];

const Sidebar: React.FC = () => {
  const { role, isLoading: userLoading, user } = useUser(); // Get role and loading state
  // TODO: Replace this with actual logic to fetch/get companyLogoUrl from settings
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  // TODO: Replace this with actual logic to fetch/get companyName from settings
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Example: Fetch settings on component mount (you'll need to adapt this)
  // useEffect(() => {
  //   const fetchSettings = async () => {
  //     // Replace with your actual settings fetching logic
  //     // const settings = await getAppSettings(); 
  //     // if (settings && settings.logoUrl) {
  //     //   setCompanyLogoUrl(settings.logoUrl);
  //     // }
  //   };
  //   fetchSettings();
  // }, []);
  const pathname = usePathname();

  // Map CrmView to route paths
  const viewToPath: ViewPath = {
    dashboard: '/dashboard',
    campaigns: '/campaigns',
    leads: '/leads',
    senders: '/senders',
    crm: '/crm',
    settings: '/settings'
  };

  const getFilteredMenuItems = () => {
    if (!role) return []; // Or a default minimal menu for guests if sidebar is shown before full auth

    if (role === 'superadmin') { // Changed to lowercase
      return menuItems; // superadmin sees all items
    }
    if (role === 'crmuser') { // Changed to lowercase
      return menuItems.filter(item => item.view === 'crm'); // crmuser only sees 'CRM'
      // To add 'Settings' for crmuser as well:
      // return menuItems.filter(item => item.view === 'crm' || item.view === 'settings'); 
    }
    return []; // Default to no items if role is unrecognized or guest within an authenticated shell
  };

  const visibleMenuItems = getFilteredMenuItems();

  if (userLoading) {
    // Optional: Render a loading state or null while user role is being determined
    return (
      <aside className="bg-base-200 text-base-content w-64 min-h-screen p-4 flex flex-col items-center justify-center">
        <span className="loading loading-dots loading-lg"></span>
      </aside>
    );
  }

  // If no user (e.g. logout initiated, session cleared but component still briefly rendered)
  // or if no visible menu items for the role (e.g. 'guest' role somehow gets here)
  if (!user || visibleMenuItems.length === 0) {
    // This case should ideally not be hit if RequireAuth and UserProvider work correctly.
    // It's a fallback. Consider if a minimal sidebar (e.g. just logo and logout) is better.
    return (
        <aside className="bg-base-200 text-base-content w-64 min-h-screen p-4 flex flex-col">
            <div className="flex items-center justify-center mb-8">
                <Image src={'/default-logo.svg'} alt={'Company Logo'} width={120} height={40} priority />
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
        <Image 
          src={companyLogoUrl || 'https://oviiqouhtdajfwhpwbyq.supabase.co/storage/v1/object/public/media//logo.png'}
          alt="Company Logo"
          width={210}
          height={197}
          priority
        />
      </div>
      <ul className="menu space-y-2 flex-1">
        {visibleMenuItems.map((item) => (
          <li key={item.view}>
            <Link
              href={viewToPath[item.view]}
              className={clsx(
                'flex items-center p-2 rounded-lg hover:bg-primary hover:text-primary-content transition-colors duration-200 w-full',
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
        <p className="text-xs text-center text-base-content/70">
          &copy; {new Date().getFullYear()} {companyName || 'True Soul Partners'}
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
