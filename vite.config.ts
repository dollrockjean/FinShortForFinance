import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative paths so the same build works at finforfinance.com and at dollrockjean.github.io/FinShortForFinance/
export default defineConfig({
  base: "./",
  plugins: [react()],
});
