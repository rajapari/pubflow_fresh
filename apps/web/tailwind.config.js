/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEEDFE', 100: '#D5D3FD', 200: '#AAABFB',
          300: '#8080F8', 400: '#6B65F4', 500: '#534AB7',
          600: '#3C3489', 700: '#2B245F',
        },
      },
    },
  },
  plugins: [],
}
