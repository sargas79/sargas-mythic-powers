import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: "es2022",
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "sargas-mythic-powers.js",
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
