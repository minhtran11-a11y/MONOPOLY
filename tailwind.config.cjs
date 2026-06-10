/** Ported from the inline tailwind.config polling block in index.html (pre-build-step era). */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Be Vietnam Pro', 'sans-serif'] },
      animation: { 'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
