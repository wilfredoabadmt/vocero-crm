import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Config sólo para verificar el port de forma aislada. En tu proyecto no la
 * necesitas: los tests de `tests/unit/` corren con tu vitest.config.ts si ya
 * tienes el alias `@` → `./src`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
