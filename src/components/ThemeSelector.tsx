'use client';

import { Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { themes } from '@/themes'; // Import our custom themes

const themeNames = Object.keys(themes);

const ThemeSelector = () => {
  const [activeTheme, setActiveTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  // Set initial theme from localStorage on client mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setActiveTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
    setMounted(true);
  }, []);

  const handleThemeChange = (themeName: string) => {
    setActiveTheme(themeName);
    localStorage.setItem('theme', themeName);
    document.documentElement.setAttribute('data-theme', themeName);
  };
  
  if (!mounted) {
    // Avoid rendering on the server to prevent hydration mismatch
    return <div className="w-8 h-8" />;
  }

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost btn-circle" title="Change theme">
        <Palette size={18} />
      </label>
      <div 
        tabIndex={0}
        className="dropdown-content z-[50] p-4 shadow-2xl bg-base-100 rounded-box w-72 max-h-[70vh] overflow-y-auto"
      >
        <h3 className="font-bold text-lg mb-4">Select Theme</h3>
        <div className="grid grid-cols-2 gap-2">
          {themeNames.map((name) => (
            <button
              key={name}
              onClick={() => handleThemeChange(name)}
              className={`btn btn-sm btn-outline justify-start text-sm capitalize ${
                activeTheme === name ? 'btn-active' : ''
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;
