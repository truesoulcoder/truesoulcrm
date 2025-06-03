'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useState } from 'react';

import { useTheme } from '@/hooks/useTheme';

import type { Theme, ThemeName } from '@/hooks/useTheme';

interface ThemeGroupProps {
  title: string;
  themes: readonly ThemeName[];
  currentTheme: ThemeName;
  onSelect: (theme: Theme) => void;
}

const ThemeGroup = ({ 
  title, 
  themes, 
  currentTheme, 
  onSelect 
}: ThemeGroupProps) => (
  <div className="mb-4">
    <div className="text-xs font-semibold text-base-content/70 px-2 py-1">
      {title}
    </div>
    <div className="grid grid-cols-2 gap-1">
      {themes.map((themeName) => (
        <button
          key={themeName}
          onClick={() => onSelect(themeName)}
          className={`btn btn-sm btn-ghost justify-start text-sm capitalize ${
            currentTheme === themeName ? 'btn-active' : ''
          }`}
          data-theme={themeName}
        >
          <div 
            className="w-3 h-3 rounded-full mr-2"
            style={{
              background: `linear-gradient(135deg, 
                hsl(var(--${themeName === 'light' || themeName === 'dark' ? 'base' : themeName}-primary) / 0.8) 0%, 
                hsl(var(--${themeName === 'light' || themeName === 'dark' ? 'base' : themeName}-secondary) / 0.8) 100%)`
            }}
          />
          {themeName.replace(/-/g, ' ')}
          {currentTheme === themeName && (
            <span className="ml-auto badge badge-primary badge-xs">✓</span>
          )}
        </button>
      ))}
    </div>
  </div>
);

export default function ThemeSelector() {
  const { 
    theme, 
    setTheme, 
    resolvedTheme, 
    themeGroups 
  } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  // Get the appropriate icon based on the current theme
  const getThemeIcon = () => {
    if (theme === 'system') return <Monitor size={16} />;
    if (resolvedTheme === 'light' || resolvedTheme === 'custom_crm_theme') return <Sun size={16} />;
    return <Moon size={16} />;
  };
  
  // Handle theme selection
  const handleThemeSelect = (selectedTheme: ThemeName | 'system') => {
    setTheme(selectedTheme);
  };

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost btn-circle" title="Change theme">
        {getThemeIcon()}
      </label>
      <div 
        tabIndex={0}
        className="dropdown-content z-[1] p-4 shadow-2xl bg-base-100 rounded-box w-80 max-h-[80vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Theme</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleThemeSelect('light')}
                className={`btn btn-sm btn-ghost ${theme === 'light' ? 'btn-active' : ''}`}
                title="Light"
              >
                <Sun size={16} />
              </button>
              <button
                onClick={() => handleThemeSelect('dark')}
                className={`btn btn-sm btn-ghost ${theme === 'dark' ? 'btn-active' : ''}`}
                title="Dark"
              >
                <Moon size={16} />
              </button>
              <button
                onClick={() => handleThemeSelect('system')}
                className={`btn btn-sm btn-ghost ${theme === 'system' ? 'btn-active' : ''}`}
                title="System"
              >
                <Monitor size={16} />
              </button>
            </div>
          </div>
          
          <div className="divider my-1"></div>
          
          <ThemeGroup
            title="Light Themes"
            themes={themeGroups.light}
            currentTheme={resolvedTheme}
            onSelect={handleThemeSelect}
          />
          
          <ThemeGroup
            title="Dark Themes"
            themes={themeGroups.dark}
            currentTheme={resolvedTheme}
            onSelect={handleThemeSelect}
          />
        </div>
      </div>
    </div>
  );
}
