import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the `@/*` path alias from tsconfig so tests can import modules
  // the same way the app does.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Only pick up dedicated *.test.ts files. Without this the runner tries
    // to import every source file as a test in Vitest 4.x defaults, which
    // both bloats output and pulls in files that depend on React/Next.js
    // client-only APIs.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "contracts/**", "scripts/**"],
  },
});
