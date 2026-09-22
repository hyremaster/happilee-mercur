import path from "path";
import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/index.css", "src/pages/index.ts"],
  format: ["esm"],
  external: [
    "react",
    "react-dom",
    "virtual:mercur/config",
    "virtual:mercur/routes",
    "virtual:mercur/components",
    "virtual:mercur/menu-items",
    "virtual:mercur/i18n",
  ],
  esbuildOptions(options) {
    options.alias = {
      "@": path.resolve(__dirname, "src"),
    };
  },
});
