'use client';

import { Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import ThemeSelector from '@/components/ThemeSelector';
import { useUser } from '@/contexts/UserContext';

// Helper function to generate initials from a name
function getInitials(name?: string): string {
  if (!name || name.trim() === '') return '??';
  const parts = name.trim().split(' ').filter(p => p !== '');
  if (parts.length === 1 && parts[0].length > 0) return parts[0].substring(0, 2).toUpperCase();
  if (parts.length > 1) {
    const firstInitial = parts[0].substring(0, 1);
    const lastInitial = parts[parts.length - 1].substring(0, 1);
    return `${firstInitial}${lastInitial}`.toUpperCase();
  }
  return '??';
}

interface NavbarProps {
  onMenuClick: () => void; // For mobile sidebar toggle
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const { user, isLoading } = useUser();
  const [fullName, setFullName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const router = useRouter();

  // Update user data when the user object changes
  useEffect(() => {
    if (!user) {
      setFullName(null);
      setEmail(null);
      return;
    }

    const fullName = user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    user.identities?.[0]?.identity_data?.full_name ||
                    user.identities?.[0]?.identity_data?.name ||
                    user.email?.split('@')[0] ||
                    'User';
    
    setFullName(fullName as string);
    setEmail(user.email || null);
  }, [user]);

  return (
    <nav className="navbar bg-base-100 shadow-sm sticky top-0 z-20">
      <div className="navbar-start">
        <button onClick={onMenuClick} className="btn btn-ghost btn-circle lg:hidden">
          <Menu size={24} />
        </button>
      </div>
      <div className="navbar-end gap-1">
        <ThemeSelector />
        <div className="dropdown dropdown-end ml-2">
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="font-medium text-sm">{fullName}</div>
            </div>
            <button 
              tabIndex={0} 
              className="btn btn-ghost btn-circle avatar"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <div className="w-10 h-10 rounded-full ring ring-primary ring-offset-base-100 ring-offset-1 flex items-center justify-center bg-base-200 overflow-hidden">
                {isLoading ? (
                  <div className="w-10 h-10 rounded-full bg-base-300 animate-pulse" />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-content text-lg font-bold border-2 border-base-100 shadow" title={fullName || ''}>
                    {getInitials(fullName ?? undefined)}
                  </div>
                )}
              </div>
            </button>
          </div>
          <ul 
            tabIndex={0} 
            className={`menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-60 ${isMenuOpen ? 'block' : 'hidden'}`}
          >
            <li className="menu-title">
              <div className="flex flex-col p-2">
                <span className="font-bold">{fullName}</span>
                {email && <span className="text-xs opacity-70">{email}</span>}
              </div>
            </li>
            <li>
              <a
                onClick={(e) => {
                  e.preventDefault();
                  import('@/lib/auth')
                    .then(({ logout }) => logout())
                    .then(() => router.replace('/'))
                    .catch((error) => {
                      console.error('Logout failed:', error instanceof Error ? error.message : String(error));
                      alert('Logout failed. Please try again.');
                    });
                }}
                className="text-error hover:bg-error hover:text-error-content"
              >
                Sign out
              </a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
