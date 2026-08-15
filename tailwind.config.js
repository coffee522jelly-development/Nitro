import { fontFamily } from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{html,js,svelte,ts}"],
  safelist: [
    { pattern: /bg-theme-.+/ },
    { pattern: /accent-theme-.+/ },
    { pattern: /font-.+/ }
  ],
  theme: {
    container: {
      center: true,
      padding: "0",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", ...fontFamily.sans],
        // The below are needed if they are used as utility classes in the code (e.g., .font-roboto)
        // Note: I already added `.font-roboto` as custom classes in app.css, which works fine,
        // but adding them here makes it available to the entire tailwind ecosystem.
        // We don't strictly *need* to define them all here because we defined custom classes in app.css,
        // but we'll add a few fallbacks just in case.
        inter: ["Inter", "sans-serif"],
        roboto: ["Roboto", "sans-serif"],
        "open-sans": ["Open Sans", "sans-serif"],
        lato: ["Lato", "sans-serif"],
        montserrat: ["Montserrat", "sans-serif"],
        "noto-sans": ["Noto Sans JP", "sans-serif"],
        ubuntu: ["Ubuntu", "sans-serif"],
        "fira-code": ["Fira Code", "monospace"],
        "jetbrains-mono": ["JetBrains Mono", "monospace"],
        "biz-udpgothic": ["BIZ UDPGothic", "sans-serif"],
      },
    },
  },
};

export default config;
