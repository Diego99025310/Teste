/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff4f8',
          100: '#ffe3ee',
          200: '#ffc9dd',
          400: '#f07999',
          500: '#e4447a',
          600: '#d7376e',
          700: '#b92561',
        },
        accent: {
          emerald: '#0f5132',
          'emerald-soft': 'rgba(16, 185, 129, 0.16)',
          danger: '#7f1d1d',
          'danger-soft': 'rgba(220, 38, 38, 0.16)',
        },
        neutral: {
          100: '#f6ecf5',
          200: '#efe4f1',
          300: '#d9cfe0',
          500: '#72687a',
          700: '#4f4655',
          900: '#231b2a',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'Montserrat', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(228, 68, 122, 0.15)',
        medium: '0 18px 45px rgba(228, 68, 122, 0.18)',
        strong: '0 28px 60px rgba(228, 68, 122, 0.2)',
      },
      borderRadius: {
        sm: '0.75rem',
        md: '1.25rem',
        lg: '1.75rem',
      },
      maxWidth: {
        container: '1100px',
      },
      backgroundImage: {
        'app-gradient':
          'radial-gradient(circle at 85% 12%, rgba(228, 68, 122, 0.18), transparent 60%), radial-gradient(circle at 12% 85%, rgba(240, 121, 153, 0.2), transparent 62%), linear-gradient(180deg, rgba(255, 240, 246, 0.92) 0%, #ffffff 55%)',
      },
      transitionTimingFunction: {
        standard: 'ease',
      },
      transitionDuration: {
        base: '240ms',
      },
    },
  },
  plugins: [],
};
