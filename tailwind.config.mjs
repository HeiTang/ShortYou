/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 60px rgba(56, 189, 248, 0.22)'
      }
    }
  },
  plugins: []
};
