import type { Config } from 'tailwindcss';

/**
 * Tailwind is scoped to the landing page only — `content` deliberately
 * excludes the rest of the codebase so the Mac app's CSS surface stays
 * exactly as it is. Tailwind's CSS is only injected by `src/landing/main.tsx`.
 */
const config: Config = {
  content: [
    './index.landing.html',
    './src/landing/**/*.{ts,tsx}',
    './src/web/HypratiaIcon.tsx',
    './src/web/LanguageSwitcher.tsx',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#06070a',
          900: '#0a0b10',
          850: '#0d0e14',
          800: '#11131a',
          750: '#161823',
          700: '#1d2030',
          600: '#262a3d',
          500: '#3a3f57',
        },
        glow: {
          violet: '#8b7cff',
          blue: '#5ac8fa',
          orange: '#ffb547',
          mint: '#7be7c7',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        serif: [
          'ui-serif',
          '"Iowan Old Style"',
          'Georgia',
          '"Times New Roman"',
          'serif',
        ],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      backgroundImage: {
        'noise-texture':
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      keyframes: {
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(20px,-30px,0) scale(1.08)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
