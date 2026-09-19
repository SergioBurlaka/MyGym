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
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'pop-out': {
          '0%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          '100%': { opacity: '0', transform: 'scale(0.95) translateY(-4px)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.12s ease-out',
        'pop-out': 'pop-out 0.12s ease-in forwards',
      },
    },
  },
  plugins: [],
};
