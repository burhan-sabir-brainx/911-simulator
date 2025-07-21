import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
        secondary: "var(--secondary)",
        accent: "var(--accent)",
        card: "var(--card-bg)",
        border: "var(--border)",
        // 911 Reality specific colors - updated to exact specifications
        'reality-black': '#000000',
        'reality-orange': '#de6d1c',    // rgb(222 109 28)
        'reality-amber': '#de6d1c',     // Same as orange
        'reality-gray': '#777c82',      // rgb(119 124 130)
        'reality-silver': '#777c82',    // Same as gray
        'reality-dark': '#1A1A1A',
      },
    },
  },
  plugins: [],
} satisfies Config;
