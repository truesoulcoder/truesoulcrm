import { heroui } from "@heroui/react";
import { themes } from "./src/themes"; // Importing our new custom themes

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    // Paths for Next.js App Router
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // Path to the HeroUI theme files
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        ...themes, // Spread in all our custom themes
      },
    }),
  ],
};

export default config;
