/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--ui-background-rgb) / <alpha-value>)',
        foreground: 'rgb(var(--ui-foreground-rgb) / <alpha-value>)',
        border: 'rgb(var(--ui-border-rgb) / <alpha-value>)',
        ring: 'rgb(var(--accent-rgb) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--ui-muted-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--ui-muted-foreground-rgb) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--ui-primary-foreground-rgb) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--ui-muted-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--ui-foreground-rgb) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--ui-destructive-rgb) / <alpha-value>)',
          foreground: 'rgb(255 255 255 / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
