import { useEffect, useState } from 'react';

// DaisyUI theme types
export type ThemeName = 
  | 'light' | 'dark' | 'cupcake' | 'bumblebee' | 'emerald' 
  | 'corporate' | 'synthwave' | 'retro' | 'cyberpunk' | 'valentine' 
  | 'halloween' | 'garden' | 'forest' | 'aqua' | 'lofi' 
  | 'pastel' | 'fantasy' | 'wireframe' | 'black' | 'luxury' 
  | 'dracula' | 'cmyk' | 'autumn' | 'business' | 'acid' 
  | 'lemonade' | 'night' | 'coffee' | 'winter' | 'dim' | 'nord' | 'sunset';

export type Theme = ThemeName | 'system';

// Group themes by type for better organization
export const themeGroups = {
  light: [
    'light', 'cupcake', 'bumblebee', 'emerald', 'corporate',
    'retro', 'cyberpunk', 'valentine', 'garden', 'aqua',
    'lofi', 'pastel', 'fantasy', 'wireframe', 'lemonade', 'winter'
  ] as const,
  dark: [
    'dark', 'synthwave', 'halloween', 'forest', 'black',
    'luxury', 'dracula', 'business', 'night', 'coffee',
    'dim', 'nord', 'sunset'
  ] as const,
  system: ['light', 'dark'] as const
} as const;

// All available themes
export const allThemes: readonly ThemeName[] = [
  ...themeGroups.light,
  ...themeGroups.dark,
] as const;

type ThemeGroup = keyof typeof themeGroups;
// Ensure ThemeName is properly typed
type ThemeValue = typeof allThemes[number];

interface UseThemeReturn {
  theme: Theme;
  resolvedTheme: ThemeName;
  isSystemDark: boolean;
  themes: readonly ThemeName[];
  themeGroups: typeof themeGroups;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Main theme hook
export const useTheme = (): UseThemeReturn => {
  const [theme, setThemeState] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ThemeName>('light');
  const [isSystemDark, setIsSystemDark] = useState(false);

  // Apply theme class to document element
  useEffect(() => {
    const root = window.document.documentElement;
    // Remove all theme classes first to avoid conflicts
    root.removeAttribute('data-theme');
    root.removeAttribute('class');
    
    // Apply the selected theme
    if (resolvedTheme) {
      root.setAttribute('data-theme', resolvedTheme);
      root.classList.add(resolvedTheme);
    }
  }, [resolvedTheme]);

  // Initialize theme from localStorage or use 'night' as default
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeName | 'system' | null;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    setIsSystemDark(systemDark);

    if (savedTheme === 'system' || (savedTheme && allThemes.includes(savedTheme as ThemeName))) {
      setThemeState(savedTheme);
      if (savedTheme !== 'system') {
        setResolvedTheme(savedTheme as ThemeName);
      } else {
        setResolvedTheme(systemDark ? 'night' : 'night');
      }
    } else {
      // Default to 'night' theme if no saved theme
      setThemeState('night');
      setResolvedTheme('night');
      localStorage.setItem('theme', 'night');
    }
  }, []);

  // Watch for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const isDark = e.matches;
      setIsSystemDark(isDark);
      if (theme === 'system') {
        setResolvedTheme('night'); // Always use night theme when system theme changes
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Set the current theme
  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('theme', newTheme);
    setThemeState(newTheme);
    
    if (newTheme !== 'system') {
      setResolvedTheme(newTheme);
    } else {
      setResolvedTheme(isSystemDark ? 'dark' : 'light');
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  return {
    theme,
    resolvedTheme,
    isSystemDark,
    themes: allThemes,
    themeGroups,
    setTheme,
    toggleTheme,
  };
};
