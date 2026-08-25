import type { Config } from "tailwindcss";

/**
 * Every colour here points at a CSS custom property defined in src/styles/tokens.css.
 * tokens.css is the single source of truth; this file only exposes it to Tailwind.
 *
 * Gotcha (see DESIGN_SYSTEM.md): because these are var-based colours rather than RGB
 * channels, Tailwind's /opacity suffix does NOT work on them. `text-accent/40` is broken.
 * Use a pre-defined wash (accent-wash) or a built-in scale (white/[0.04]) instead.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sunken: "var(--bg-sunken)",
        base: "var(--bg)",
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          4: "var(--surface-4)",
          5: "var(--surface-5)",
        },
        hairline: "var(--hairline)",
        edge: "var(--border)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          wash: "var(--accent-wash)",
          dim: "var(--accent-dim)",
          on: "var(--on-accent)",
        },
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        muted: "var(--text-muted)",
        success: "var(--success)",
        danger: {
          DEFAULT: "var(--danger)",
          wash: "var(--danger-wash)",
          dim: "var(--danger-dim)",
        },
        info: "var(--info)",
        live: "var(--live)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["SF Mono", "ui-monospace", "Cascadia Code", "monospace"],
      },
      fontSize: {
        overline: ["10px", { lineHeight: "12px", letterSpacing: "0.4px", fontWeight: "600" }],
        caption: ["11px", { lineHeight: "14px", letterSpacing: "0.05px", fontWeight: "500" }],
        body: ["12px", { lineHeight: "16px", letterSpacing: "0", fontWeight: "450" }],
        "body-strong": ["12px", { lineHeight: "16px", fontWeight: "600" }],
        title: ["13px", { lineHeight: "18px", letterSpacing: "-0.1px", fontWeight: "600" }],
        stat: ["15px", { lineHeight: "20px", letterSpacing: "-0.2px", fontWeight: "600" }],
        display: ["22px", { lineHeight: "26px", letterSpacing: "-0.4px", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        island: "14px",
      },
      boxShadow: {
        overlay: "0 8px 24px -4px rgba(0,0,0,.5), 0 2px 6px -2px rgba(0,0,0,.4)",
        modal: "0 16px 48px -8px rgba(0,0,0,.6), 0 4px 12px -4px rgba(0,0,0,.45)",
        "top-highlight": "inset 0 1px 0 rgba(255,255,255,.05)",
        focus: "0 0 0 2px rgba(217,165,33,.55), 0 0 0 4px rgba(217,165,33,.15)",
        slide: "0 12px 32px -8px rgba(0,0,0,.55), 0 2px 8px -2px rgba(0,0,0,.4)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.2,0,0,1)",
        in: "cubic-bezier(.4,0,1,1)",
        move: "cubic-bezier(.4,0,.2,1)",
        spring: "cubic-bezier(.34,1.3,.64,1)",
      },
      transitionDuration: {
        instant: "80ms",
        micro: "120ms",
        standard: "200ms",
        large: "300ms",
      },
      zIndex: {
        "canvas-banner": "40",
        overlay: "90",
        island: "95",
        modal: "100",
        recovery: "200",
      },
    },
  },
  plugins: [],
} satisfies Config;
