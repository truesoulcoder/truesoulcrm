'use client';

import React, { useState, useEffect } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';

export const ThemeToggleButton: React.FC = () => {
  // Default theme is 'light'
  const [theme, setTheme] = useState('light');
  const [isMounted, setIsMounted] = useState(false);

  // On component mount, read the theme from localStorage or default to 'light'
  useEffect(() => {
    setIsMounted(true);
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme);
    }
  }, []);

  // Whenever the theme state changes, update the <html> attribute and localStorage
  useEffect(() => {
    if (isMounted) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme, isMounted]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // Prevent rendering a mismatched button during hydration
  if (!isMounted) {
    return <Button isIconOnly variant="flat" isLoading />;
  }

  return (
    <Tooltip content={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}>
      <Button
        isIconOnly
        variant="flat"
        onPress={toggleTheme}
        aria-label="Toggle theme"
      >
        {theme === 'light' ? (
          <Icon icon="lucide:moon" width={20} height={20} />
        ) : (
          <Icon icon="lucide:sun" width={20} height={20} />
        )}
      </Button>
    </Tooltip>
  );
};