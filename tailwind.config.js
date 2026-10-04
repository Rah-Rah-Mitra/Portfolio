/** @type {import('tailwindcss').Config} */
// Tailwind contributes only its preflight reset and the `sr-only` utility; every
// visual rule is a token or component class in index.css (Industry design system).
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
