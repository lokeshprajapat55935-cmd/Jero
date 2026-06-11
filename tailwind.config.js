/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  safelist: [
    'animate-shimmer',
    'active:scale-95',
    'active:scale-[0.98]',
    'transition-all',
    'transition-colors',
    'transition-transform',
    {
      pattern: /^(bg|text|border)-(primary|secondary|accent|destructive|muted|card|popover|border|input|ring|background|foreground|success|warning)/,
      variants: ['hover', 'dark', 'active'],
    },
    {
      pattern: /^(bg|text|border)-(emerald|green|amber|blue|purple|red|orange|yellow|indigo|sky|teal)-(50|100|200|400|500|600|700|800|950)/,
      variants: ['hover', 'dark', 'active'],
    },
    {
      pattern: /^(bg|text|border)-(emerald|green|amber|blue|purple|red|orange|yellow|indigo|sky|teal)-(500|600|700|800)\/10/,
      variants: ['hover', 'dark'],
    },
    {
      pattern: /^(bg|text|border)-(red|emerald)-(500)\/5/,
    },
    'active:scale-90',
    {
      pattern: /^(bg|text|border)-(violet|rose)-(500|600|700|800)/,
      variants: ['hover', 'dark', 'active'],
    },
    {
      pattern: /^(bg|text|border)-(violet|rose)-(500|600)\/10/,
      variants: ['hover', 'dark'],
    }
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '80rem',
      },
    },
    extend: {
      colors: {
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          soft: 'hsl(var(--surface-soft))',
        },
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
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 18px 60px -36px rgba(15, 23, 42, 0.38)",
        lift: "0 18px 42px -26px rgba(15, 23, 42, 0.42)",
        focus: "0 0 0 4px hsl(var(--ring) / 0.14)",
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'fade-in': 'fade-in 0.32s ease-out forwards',
        'slide-up': 'slide-up 0.32s ease-out forwards',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        noto: ['var(--font-noto)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
