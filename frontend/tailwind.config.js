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
        // Workout page placeholders: last time's value / today's +1 target
        // (both >= 4.5:1 on `surface`). `hint` is also the journal's per-side line.
        hint: '#828a99',
        target: '#d08561',
      },
      boxShadow: {
        // The active tab's square in the bottom panel: a soft accent glow.
        'nav-active': '0 4px 14px rgba(255,90,54,0.35)',
        // The bottom panel, in the accent so it stands out from the page it shares
        // a colour with: a thin 4px ring outside the border, an upward glow and a
        // warm highlight on its top edge. The ring doesn't take layout room - it
        // fits in the panel's 6px gap. With the "More" sheet open there is no
        // upward glow: the panel is above the sheet then, and it would tint its
        // last row. Not brighter - the user had it toned down to this.
        'nav-panel':
          '0 0 0 4px rgba(255,90,54,0.07), 0 -8px 30px rgba(255,90,54,0.28), inset 0 1px 0 rgba(255,140,110,0.14)',
        'nav-panel-open': '0 0 0 4px rgba(255,90,54,0.07), inset 0 1px 0 rgba(255,140,110,0.14)',
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
        // DatePicker - timings after Ant Design's motion-slide-up / zoom-big.
        'dp-slide-in': { '0%': { opacity: '0', transform: 'scaleY(0.8)' }, '100%': { opacity: '1', transform: 'scaleY(1)' } },
        'dp-slide-out': { '0%': { opacity: '1', transform: 'scaleY(1)' }, '100%': { opacity: '0', transform: 'scaleY(0.8)' } },
        'dp-fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'dp-fade-out': { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        'dp-from-right': { '0%': { opacity: '0', transform: 'translateX(18px)' }, '100%': { opacity: '1', transform: 'none' } },
        'dp-from-left': { '0%': { opacity: '0', transform: 'translateX(-18px)' }, '100%': { opacity: '1', transform: 'none' } },
        'dp-panel': { '0%': { opacity: '0', transform: 'scale(0.92)' }, '100%': { opacity: '1', transform: 'none' } },
        'dp-pop': { '0%': { transform: 'scale(0.6)' }, '60%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)' } },
        // Phone navigation (BottomNav "More" sheet, AccountMenu).
        // 8px is the sheet's gap above the bottom panel: it fades in without going
        // behind the panel, whose gaps and rounded corners wouldn't hide it.
        'sheet-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        'menu-pop': { '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.98)' }, '100%': { opacity: '1', transform: 'none' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      animation: {
        'pop-in': 'pop-in 0.12s ease-out',
        'pop-out': 'pop-out 0.12s ease-in forwards',
        'dp-slide-in': 'dp-slide-in 0.2s cubic-bezier(0.23, 1, 0.32, 1) both',
        'dp-slide-out': 'dp-slide-out 0.16s cubic-bezier(0.755, 0.05, 0.855, 0.06) both',
        'dp-fade-in': 'dp-fade-in 0.2s ease-out both',
        'dp-fade-out': 'dp-fade-out 0.16s ease-in both',
        'dp-from-right': 'dp-from-right 0.22s cubic-bezier(0.23, 1, 0.32, 1) both',
        'dp-from-left': 'dp-from-left 0.22s cubic-bezier(0.23, 1, 0.32, 1) both',
        'dp-panel': 'dp-panel 0.2s cubic-bezier(0.08, 0.82, 0.17, 1) both',
        'dp-pop': 'dp-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'sheet-up': 'sheet-up 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'menu-pop': 'menu-pop 0.16s ease-out both',
        'fade-in': 'fade-in 0.18s ease-out both',
      },
    },
  },
  plugins: [],
};
