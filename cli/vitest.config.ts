import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    disableConsoleIntercept: true, // Required for @oclif/test to capture stdout/stderr
  },
});
