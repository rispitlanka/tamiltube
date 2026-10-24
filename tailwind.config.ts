import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16130f", soft: "#4a443b", mute: "#857d70" },
        paper: { DEFAULT: "#faf6ef", card: "#ffffff", line: "#e8e0d2" },
        kolam: { DEFAULT: "#c2410c", soft: "#fde7d9", deep: "#7c2d12" },
        leaf: { DEFAULT: "#15803d", soft: "#dcf3e3" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        tamil: ["var(--font-tamil)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
