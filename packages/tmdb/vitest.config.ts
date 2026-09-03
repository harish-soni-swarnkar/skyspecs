import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts is re-exports + a one-line URL helper; not worth a coverage gate.
      exclude: ["src/index.ts", "**/*.test.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});
