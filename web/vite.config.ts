import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Relative asset URLs keep the build independent of the hosting path.
  base: "./",
  resolve: {
    // The core sources live outside web/, so pin shared packages to web's own install.
    // A clean checkout can then build with only `npm ci` inside web/.
    alias: {
      "@apidevtools/swagger-parser": here("node_modules/@apidevtools/swagger-parser"),
    },
  },
  server: { fs: { allow: [here("..")] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: here("index.html"),
        playground: here("playground/index.html"),
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
  },
});
