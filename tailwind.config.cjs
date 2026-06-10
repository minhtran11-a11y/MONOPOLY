/** SƠN MÀI (Indochine Lacquer Deco) design tokens — see gan-harness/direction.md */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Be Vietnam Pro', 'sans-serif'],
        display: ['Playfair Display', 'Be Vietnam Pro', 'serif'],
      },
      colors: {
        lac: { 900: '#0B0A0C', 800: '#1A0E10', 700: '#241114' },
        son: { 700: '#6E1414', 600: '#8A1A1A', 500: '#A52525' },
        gold: { 300: '#F4D99A', 400: '#E8C16B', 500: '#D4A94E', 600: '#B8893C' },
        jade: { 500: '#2E7D6B', 400: '#3E9A85' },
        ivory: '#F4ECD8',
        terracotta: '#C2410C',
      },
      boxShadow: {
        lac: '0 24px 60px -18px rgba(0,0,0,0.75), 0 2px 0 0 rgba(232,193,107,0.10) inset',
        'lac-lg': '0 40px 90px -24px rgba(0,0,0,0.8), 0 2px 0 0 rgba(232,193,107,0.14) inset',
        'gold-glow': '0 0 0 1px rgba(232,193,107,0.5), 0 14px 40px -10px rgba(232,193,107,0.35)',
      },
      letterSpacing: { deco: '0.28em' },
      transitionTimingFunction: {
        lac: 'cubic-bezier(.2,.8,.2,1)',
        gold: 'cubic-bezier(.34,1.4,.5,1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'lac-rise': 'lac-rise 0.6s cubic-bezier(.2,.8,.2,1) both',
        'drum-spin': 'drum-spin 90s linear infinite',
      },
      keyframes: {
        'lac-rise': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'drum-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
