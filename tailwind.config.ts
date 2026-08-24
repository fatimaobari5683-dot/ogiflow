import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Palette validée (CVD-safe) — voir la skill dataviz du projet.
        brand: {
          50: '#eef6ff',
          500: '#2a78d6',
          600: '#256abf',
          700: '#184f95',
        },
        surface: {
          DEFAULT: '#fcfcfb',
          page: '#f9f9f7',
        },
        ink: {
          primary: '#0b0b0b',
          secondary: '#52514e',
          muted: '#898781',
        },
        hairline: '#e1e0d9',
        status: {
          good: '#0ca30c',
          warning: '#fab219',
          serious: '#ec835a',
          critical: '#d03b3b',
        },
        series: {
          1: '#2a78d6', // blue
          2: '#eb6834', // orange
          3: '#1baf7a', // aqua
          4: '#eda100', // yellow
          5: '#e87ba4', // magenta
          6: '#008300', // green
          7: '#4a3aa7', // violet
          8: '#e34948', // red
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
