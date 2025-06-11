// src/components/layout/NavbarNew.tsx
'use client'; // <--- This line fixes the error.

import React from "react";
import {
  Navbar,
  NavbarMenuToggle,
  NavbarMenuItem,
  NavbarMenu,
  NavbarContent,
  NavbarItem,
  Button,
  Avatar, // Using HeroUI Avatar
} from "@heroui/react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/contexts/UserContext";
import { ThemeToggleButton } from "../ui/ThemeToggleButton";
import { supabase } from "@/lib/supabase/client";

// Helper function to generate initials
function getInitials(name?: string | null): string {
  if (!name) return '??';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return '??';
}

export default function NavbarNew() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { user, fullName, avatarUrl, role, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const menuItems = [
    { name: "Dashboard", href: "/dashboard", roles: ['superadmin'] },
    { name: "CRM", href: "/crm", roles: ['superadmin', 'guest'] },
    { name: "Leads", href: "/leads", roles: ['superadmin'] },
    { name: "Campaigns", href: "/campaigns", roles: ['superadmin'] },
    { name: "Senders", href: "/senders", roles: ['superadmin'] },
    { name: "Settings", href: "/settings", roles: ['superadmin'] },
  ];

  const visibleMenuItems = menuItems.filter(item => role && item.roles.includes(role));

  return (
    <Navbar isBordered isMenuOpen={isMenuOpen} onMenuOpenChange={setIsMenuOpen} maxWidth="full">
      <NavbarContent>
        <NavbarMenuToggle aria-label={isMenuOpen ? "Close menu" : "Open menu"} className="sm:hidden" />
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        {visibleMenuItems.map((item) => (
          <NavbarItem key={item.href} isActive={pathname === item.href}>
            <NextLink href={item.href}>
              {item.name}
            </NextLink>
          </NavbarItem>
        ))}
      </NavbarContent>

      <NavbarContent justify="end">
        <ThemeToggleButton />
        <NavbarItem>
          {isLoading ? (
            <div className="w-10 h-10 rounded-full bg-default-300 animate-pulse" />
          ) : user ? (
            <Avatar 
              isBordered 
              color="primary"
              src={avatarUrl || undefined} 
              name={getInitials(fullName)} 
            />
          ) : (
            <Button as={NextLink} href="/" color="primary" variant="flat">
              Login
            </Button>
          )}
        </NavbarItem>
      </NavbarContent>

      <NavbarMenu>
        {visibleMenuItems.map((item, index) => (
          <NavbarMenuItem key={`${item.name}-${index}`} isActive={pathname === item.href}>
            <NextLink href={item.href} onClick={() => setIsMenuOpen(false)}>
              {item.name}
            </NextLink>
          </NavbarMenuItem>
        ))}
        {user && (
            <NavbarMenuItem className="mt-4">
                 <Button color="danger" variant="flat" fullWidth onPress={handleSignOut}>
                    Sign Out
                </Button>
            </NavbarMenuItem>
        )}
      </NavbarMenu>
    </Navbar>
  );
}