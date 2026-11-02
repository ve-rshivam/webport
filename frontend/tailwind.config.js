/**
 * Tailwind CSS v4 does not load this file automatically.
 * Dark mode is configured with @custom-variant in src/index.css.
 * Keep this file only if you later opt in with `@config`.
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: 'class', // 👈 YEH LINE DARK MODE KO ACTIVE KAREGI
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}