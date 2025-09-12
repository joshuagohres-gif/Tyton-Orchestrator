import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy support
        background: "var(--bg)",
        foreground: "var(--text)",
        
        // New theme system
        bg: "var(--bg)",
        "bg-elev": "var(--bg-elev)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        "accent-contrast": "var(--accent-contrast)",
        ring: "var(--ring)",
        border: "var(--border)",
        
        // Legacy Tyton colors (maintained for compatibility)
        tyton: {
          gold: "var(--accent)",
          "gold-light": "var(--gold-300)", 
          "gold-dark": "var(--gold-700)",
          black: "var(--bg)",
          "black-soft": "var(--surface)",
          white: "var(--text)",
          "gray-warm": "var(--bg-elev)"
        },
        
        // Full gold palette
        gold: {
          50: "var(--gold-50)",
          100: "var(--gold-100)",
          200: "var(--gold-200)",
          300: "var(--gold-300)",
          400: "var(--gold-400)",
          500: "var(--gold-500)",
          600: "var(--gold-600)",
          700: "var(--gold-700)",
          800: "var(--gold-800)",
          900: "var(--gold-900)",
        },
        
        // Full black palette
        black: {
          850: "var(--black-850)",
          875: "var(--black-875)",
          900: "var(--black-900)",
        }
      },
      boxShadow: {
        card: "var(--shadow-card)",
        glow: "var(--glow-soft)",
      },
      backgroundImage: {
        "gradient-gold": "var(--gradient-gold)",
        "gradient-surface": "var(--gradient-surface)",
      },
      fontFamily: {
        'nasa': ['Helvetica Neue', 'Arial', 'sans-serif'],
      },
      transitionDuration: {
        DEFAULT: "var(--transition-duration)",
      }
    },
  },
  plugins: [],
};
export default config;
