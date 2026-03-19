/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#4f46e5',
        'secondary': '#a855f7',
        'dark': '#0f172a',
        'dark-card': '#1e293b',
      }
    },
  },
  plugins: [],
}
