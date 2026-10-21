import { defineConfig } from "tsup";
import path from "path";

export default defineConfig((options) => ({
  // Clean only one-off builds. `tsup --watch` (turbo dev) starts while other
  // tasks read dist/; wiping it then breaks them (ENOENT / unresolved entry).
  clean: !options.watch,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.alias = {
      "@components": path.resolve("src/components"),
      "@hooks": path.resolve("src/hooks"),
      "@lib": path.resolve("src/lib"),
      "@": path.resolve("src"),
    };
  },
  external: ["react", "react-dom", "virtual:mercur/config", "virtual:mercur/routes"],
}));
