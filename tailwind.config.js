/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Core EscalaiApp Colors (Baseadas no theme.ts e uso real)
        primary: "#ffe600",
        "primary-dark": "#d9c400",
        secondary: "#31366c", // Cor usada em botões de destaque

        // Backgrounds & Surfaces
        background: "#13151f",
        surface: "#1e2332",
        "header-bg": "#0f1118",

        // Borders
        border: "#2d3345",

        // Text Colors
        text: "#ffffff",
        "text-secondary": "#94a3b8",
        "text-muted": "#64748b",
        "text-light": "#cbd5e1",
        "text-dark": "#475569",

        // Semantic/Utility
        success: "#4ade80",
        danger: "#f87171",
        warning: "#eab308",
        info: "#3b82f6",
        orange: "#ff9500",
      },
      fontFamily: {
        spaceGrotesk: ["SpaceGrotesk-Regular", "sans-serif"],
        spaceGroteskBold: ["SpaceGrotesk-Bold", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        'glow': '0 0 15px rgba(255, 230, 0, 0.15)',
        'glow-focus': '0 0 20px rgba(255, 230, 0, 0.3)',
      }
    },
  },
  plugins: [],
}
