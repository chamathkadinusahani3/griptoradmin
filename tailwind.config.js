/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        // These 5 resolve through CSS custom properties (set per-tenant by
        // TenantThemeScope, src/App.tsx) so a tenant's chosen brand palette
        // can override them at runtime. The var() fallback is the original
        // hardcoded value, so anything that never gets a tenant override
        // (super admin, login) renders identically to before this existed.
        navy: 'var(--brand-navy, #19356E)',
        royal: 'var(--brand-royal, #2164B4)',
        'bright-blue': 'var(--brand-bright-blue, #2A8BD4)',
        teal: 'var(--brand-teal, #1EA4B6)',
        cyan: 'var(--brand-cyan, #22C1C7)',
        'light-blue': '#E6F5F7',
        'soft-gray': '#F7FAFC',
        'text-gray': '#4B5563',
        'border-soft': '#DCEAF0',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,0.04), 0 4px 16px rgba(16,24,40,0.06)',
        'soft-lg': '0 4px 24px rgba(16,24,40,0.08), 0 12px 40px rgba(16,24,40,0.06)',
      },
      backgroundImage: {
        'griptor-gradient':
          'linear-gradient(135deg, var(--brand-navy, #19356E) 0%, var(--brand-royal, #2164B4) 40%, var(--brand-teal, #1EA4B6) 80%, var(--brand-cyan, #22C1C7) 100%)',
        'griptor-gradient-soft':
          'linear-gradient(135deg, var(--brand-royal, #2164B4) 0%, var(--brand-teal, #1EA4B6) 100%)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
}
