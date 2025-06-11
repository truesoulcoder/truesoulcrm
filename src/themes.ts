// src/themes.ts

/**
 * A collection of DaisyUI themes translated into the HeroUI format.
 * Each theme object defines the color palette for the HeroUI components.
 */
type HeroUITheme = {
    extend: 'dark' | 'light';
    layout?: Record<string, any>;
    colors?: Record<string, any>;
  };
  
  type ThemeCollection = {
    [key: string]: HeroUITheme;
  };
  
  export const themes: ThemeCollection = {
    light: {
      extend: 'light',
      colors: {
        background: "#ffffff",
        foreground: "#1f2937",
        primary: { DEFAULT: "#570df8", foreground: "#ffffff" },
        secondary: { DEFAULT: "#f000b8", foreground: "#ffffff" },
        success: { DEFAULT: "#36d399", foreground: "#1f2937" },
        danger: { DEFAULT: "#f87272", foreground: "#1f2937" },
      },
    },
    dark: {
      extend: 'dark',
      colors: {
        background: "#2a323c",
        foreground: "#a6adbb",
        primary: { DEFAULT: "#793ef9", foreground: "#ffffff" },
        secondary: { DEFAULT: "#f000b8", foreground: "#ffffff" },
        success: { DEFAULT: "#36d399", foreground: "#1f2937" },
        danger: { DEFAULT: "#f87272", foreground: "#1f2937" },
      },
    },
    synthwave: {
      extend: 'dark',
      colors: {
        primary: "#e779c1",
        secondary: "#58c7f3",
        accent: "#f3cc30",
        neutral: "#20134e",
        "base-100": "#2d1b69",
        info: "#53cde2",
        success: "#99e2b4",
        warning: "#f9a109",
        danger: "#ff7575",
      },
    },
    cyberpunk: {
      extend: 'light',
      colors: {
        primary: "#ff7598",
        secondary: "#75d1f0",
        accent: "#c07eec",
        neutral: "#423f00",
        "base-100": "#ffee00",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
      },
    },
    valentine: {
      extend: 'light',
      colors: {
        primary: "#e96d7b",
        secondary: "#a991f7",
        accent: "#86d3cc",
        neutral: "#af4670",
        "base-100": "#f0d6e8",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
      },
    },
    aqua: {
      extend: 'dark',
      colors: {
        primary: "#09ecf3",
        secondary: "#966fb3",
        accent: "#ffe999",
        neutral: "#3b8ac4",
        "base-100": "#345da7",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
      },
    },
    halloween: {
      extend: 'dark',
      colors: {
        primary: "#f28c18",
        secondary: "#6d3a9c",
        accent: "#51a800",
        neutral: "#1b1d1d",
        "base-100": "#212121",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
      },
    },
    forest: {
      extend: 'dark',
      colors: {
        primary: "#1eb854",
        secondary: "#1fd65f",
        accent: "#16a34a",
        neutral: "#191e24",
        "base-100": "#11191f",
        info: "#3abff8",
        success: "#36d399",
        warning: "#fbbd23",
        danger: "#f87272",
      },
    },
    black: {
      extend: 'dark',
      colors: {
        primary: "#343232",
        secondary: "#343232",
        accent: "#343232",
        "base-100": "#000000",
        "base-content": "#ffffff",
        neutral: "#2a2e37",
        info: "#0000ff",
        success: "#008000",
        warning: "#ffff00",
        danger: "#ff0000",
      },
    },
    luxury: {
      extend: 'dark',
      colors: {
        primary: "#ffffff",
        secondary: "#152747",
        accent: "#513448",
        neutral: "#1b1d1d",
        "base-100": "#09090b",
        info: "#66c6ff",
        success: "#87d039",
        warning: "#e2d562",
        danger: "#ff6f6f",
      },
    },
    dracula: {
      extend: 'dark',
      colors: {
        primary: "#ff79c6",
        secondary: "#bd93f9",
        accent: "#ffb86c",
        neutral: "#414558",
        "base-100": "#282a36",
        info: "#8be9fd",
        success: "#50fa7b",
        warning: "#f1fa8c",
        danger: "#ff5555",
      },
    },
    coffee: {
      extend: 'dark',
      colors: {
        primary: "#db924b",
        secondary: "#263e3f",
        accent: "#10576d",
        neutral: "#20161f",
        "base-100": "#2d2629",
        info: "#66c6ff",
        success: "#87d039",
        warning: "#e2d562",
        danger: "#ff6f6f",
      },
    },
    night: {
      extend: 'dark',
      colors: {
        primary: "#38bdf8",
        secondary: "#818cf8",
        accent: "#f471b5",
        neutral: "#1e293b",
        "base-100": "#0f172a",
        info: "#0ca5e9",
        success: "#2dd4bf",
        warning: "#f59e0b",
        danger: "#e11d48",
      },
    },
    retro: {
      extend: 'light',
      colors: {
        primary: "#ef9995",
        secondary: "#a4cbb4",
        accent: "#ebdc99",
        neutral: "#7d7259",
        "base-100": "#e4d8b4",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
      },
    },
    garden: {
      extend: 'light',
      colors: {
        primary: "#5c7f67",
        secondary: "#ecf4e7",
        accent: "#fae5e5",
        neutral: "#818181",
        "base-100": "#f9fafb",
        info: "#3abff8",
        success: "#36d399",
        warning: "#fbbd23",
        danger: "#f87272",
      },
    },
    cupcake: {
      extend: 'light',
      colors: {
        primary: "#65c3c8",
        secondary: "#ef9fbc",
        accent: "#eeaf3a",
        neutral: "#291334",
        "base-100": "#faf7f5",
        info: "#3abff8",
        success: "#36d399",
        warning: "#fbbd23",
        danger: "#f87272",
      },
    },
    bumblebee: {
      extend: 'light',
      colors: {
        primary: "#e0a82e",
        secondary: "#f9d72f",
        accent: "#18182f",
        neutral: "#18182f",
        "base-100": "#ffffff",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
      },
    },
  };
  