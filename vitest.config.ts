import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/jcs-data-engine/orchestrator/**/*.ts"],
      reporter: ["text", "text-summary"],
    },
  },
});