/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Design System Stitch Escalai
        primary: "#ffe600", // Mercado Livre Yellow
        "primary-dark": "#d9c400",
        "primary-content": "#1a1a1a",

        // Backgrounds
        background: "#1a1a1a", // Deep dark grey
        "background-light": "#f8f8f5",

        // Surfaces
        surface: "#2a2a2a",
        "surface-dark": "#27272a",
        "surface-lighter": "#2d2d2d",
        "surface-active": "#3f3f46",

        // Accent Colors
        "mercado-blue": "#2d3277", // Mercado Livre Blue
        "accent-blue": "#3483fa", // Mercado Livre Blue accent

        // Text Colors
        text: "#ffffff",
        textSecondary: "#8e8e93",
        "text-muted": "#9ca3af",

        // Utility
        orange: "#ff9500",
        green: "#4ade80",
        red: "#ef4444",
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
