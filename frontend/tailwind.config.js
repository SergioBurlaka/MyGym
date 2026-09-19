/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#14171c',
          raised: '#1c2028',
          border: '#2a2f3a',
        },
        accent: {
          DEFAULT: '#ff5a36',
          hover: '#ff7452',
          muted: '#7a2f1e',
        },
        good: '#3ddc97',
        warn: '#eda100',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
