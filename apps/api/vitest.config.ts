import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Cover the logic, not the wiring/re-exports. Assumes a DB is up (integration covers the
      // repos) — same as CI. Locally, run `pnpm bootstrap` first.
      exclude: [
        "src/index.ts",
        "src/config.ts",
        "src/db/pool.ts",
        "src/db/setup.ts",
        "src/db/migrate.ts",
        "src/domain/types.ts",
        "src/test/**",
        "**/*.test.ts",
      ],
      reporter: ["text-summary"],
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});
