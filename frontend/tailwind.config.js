/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'pink-strong': '#e4447a',
        'pink-medium': '#f07999',
        'pink-soft': '#f9e7ed',
        ink: '#222222',
        pale: '#fdf5f7'
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif']
      }
    }
  },
  plugins: []
};
