// tailwind.config.js
import { heroui } from "@heroui/react";

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/react/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [
    // Plugin for @heroui/react components
    heroui({
      themes: {
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
      }
    }),
  ],
};