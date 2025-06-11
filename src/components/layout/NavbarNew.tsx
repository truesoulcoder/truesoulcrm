import React from "react";
import {
  Navbar,
  NavbarBrand,
  NavbarMenuToggle,
  NavbarMenuItem,
  NavbarMenu,
  NavbarContent,
  NavbarItem,
  Button, // Import Button for Sign Out
} from "@heroui/react";
import NextLink from "next/link"; // Use NextLink for client-side navigation
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/UserContext";
import ThemeSelector from "@/components/ThemeSelector";

// Helper function to generate initials from a name (from Navbar.tsx)
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

export const Logo = () => {
  return (
    <svg fill="none" height="36" viewBox="0 0 32 32" width="36"> {/* Adjusted size */}
      <path
        clipRule="evenodd"
        d="M17.6482 10.1305L15.8785 7.02583L7.02979 22.5499H10.5278L17.6482 10.1305ZM19.8798 14.0457L18.11 17.1983L19.394 19.4511H16.8453L15.1056 22.5499H24.7272L19.8798 14.0457Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
};

// Define menu item paths
const menuItemPaths: { [key: string]: string } = {
  "Campaign Dashboard": "/campaigns",
  "Leads": "/leads",
  "CRM": "/crm",
  "Senders": "/senders",
  "Engine Control": "/engine-control",
  "Settings": "/settings",
};

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { user, fullName: userFullName, email: userEmail, isLoading } = useUser(); // Get user data
  const router = useRouter();

  const menuItems = [
    "Campaign Dashboard",
    "Leads",
    "CRM",
    "Senders",
    "Engine Control",
    "Settings",
  ];

  const handleSignOut = () => {
    import('@/lib/auth')
      .then(({ logout }) => logout())
      .then(() => router.replace('/'))
      .catch((error) => {
        console.error('Logout failed:', error instanceof Error ? error.message : String(error));
        // Optionally, show an alert or notification to the user
        alert('Logout failed. Please try again.');
      });
  };

  const initials = getInitials(userFullName ?? undefined);

  return (
    <Navbar isBordered isMenuOpen={isMenuOpen} onMenuOpenChange={setIsMenuOpen} maxWidth="full">
      {/* Hamburger Menu Toggle - visible on all screens */}
      <NavbarContent justify="start">
        <NavbarMenuToggle aria-label={isMenuOpen ? "Close menu" : "Open menu"} />
      </NavbarContent>

      {/* Logo and Brand Name - visible on all screens */}
      <NavbarContent justify="center" className="sm:justify-start"> {/* Adjusted for consistency */}
        <NavbarBrand as={NextLink} href="/">
          <Logo />
          <p className="font-bold text-inherit ml-2">ACME</p>
        </NavbarBrand>
      </NavbarContent>

      {/* Right side content: ThemeSelector and User Avatar */}
      <NavbarContent justify="end">
        <ThemeSelector />
        <NavbarItem>
          {isLoading ? (
            <div className="w-10 h-10 rounded-full bg-gray-300 animate-pulse" />
          ) : user ? (
            // Attempt to use HeroUI Avatar, fallback to styled div
            // Note: HeroUI might not have an Avatar component that directly takes initials.
            // We might need to style a div or use a different approach if Avatar is not suitable.
            // For now, let's assume a simple div for initials.
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center bg-primary text-primary-content text-lg font-bold cursor-pointer"
              onClick={() => setIsMenuOpen(!isMenuOpen)} // Avatar click can also toggle menu
              title={userFullName ?? 'User menu'}
            >
              {initials}
            </div>
          ) : (
            <Button as={NextLink} href="/login" color="primary" variant="ghost">
              Sign In
            </Button>
          )}
        </NavbarItem>
      </NavbarContent>

      {/* Popover Menu */}
      <NavbarMenu>
        {user && (
          <NavbarMenuItem className="border-b border-divider pb-2 mb-2">
            <div className="flex flex-col p-2">
              <span className="font-bold">{userFullName}</span>
              {userEmail && <span className="text-xs opacity-70">{userEmail}</span>}
            </div>
          </NavbarMenuItem>
        )}
        {menuItems.map((item, index) => (
          <NavbarMenuItem key={`${item}-${index}`}>
            <NextLink href={menuItemPaths[item] || "#"} passHref legacyBehavior>
              <Button
                as="a" // Render as an anchor tag
                className="w-full justify-start"
                variant="light" // Use a light variant for menu items
                onPress={() => setIsMenuOpen(false)} // Close menu on item click
              >
                {item}
              </Button>
            </NextLink>
          </NavbarMenuItem>
        ))}
        {user && (
          <NavbarMenuItem className="mt-2 pt-2 border-t border-divider">
            <Button
              color="danger"
              className="w-full"
              onPress={handleSignOut}
            >
              Sign out
            </Button>
          </NavbarMenuItem>
        )}
      </NavbarMenu>
    </Navbar>
  );
}
