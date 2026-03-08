/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono:  ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          bg:       '#F8F9FC',
          surface:  '#FFFFFF',
          surface2: '#F1F4F9',
          border:   '#E2E8F0',
          primary:  '#2563EB',
          navy:     '#0F172A',
          text:     '#334155',
          muted:    '#94A3B8',
          green:    '#059669',
          red:      '#DC2626',
          amber:    '#D97706',
        },
      },
      borderRadius: { DEFAULT: '8px', lg: '12px', xl: '16px' },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        md:   '0 4px 12px rgba(0,0,0,0.08)',
        lg:   '0 8px 32px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
