/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

// Vitest config separate from vite.config.ts so test runs don't load the
// Vite dev-server proxy + React plugin -- those are irrelevant to unit
// tests and slow startup. We still need jsdom so DOM-touching code (fetch
// wrappers checking response.type, etc.) has a window to live in.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    clearMocks: true,
    restoreMocks: true,
  },
});
