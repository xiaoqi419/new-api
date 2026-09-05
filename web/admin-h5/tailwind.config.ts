import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      minHeight: {
        screen: "100dvh",
      },
    },
  },
  plugins: [],
} satisfies Config;
