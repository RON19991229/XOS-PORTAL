/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        ink: '#0a0a0a',
        'ink-soft': '#161616',
        'ink-line': '#2a2a2a',
        bone: '#f5f5f5',
        accent: '#FFD60A',
        'accent-dark': '#E6C100',
        danger: '#ff3b30',
        success: '#34c759',
        'success-green': '#16c75b',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'flash-danger': 'flash 1.5s ease-in-out infinite',
        'slam': 'slamIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
        slamIn: {
          '0%': { transform: 'scale(0.5) rotate(-5deg)', opacity: '0' },
          '60%': { transform: 'scale(1.05) rotate(1deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
