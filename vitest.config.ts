import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "text-summary"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
