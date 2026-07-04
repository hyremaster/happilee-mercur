import { defineConfig } from "tsup"

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["cjs"],
  sourcemap: true,
  target: "node20",
  outDir: "dist",
  treeshake: true,
  external: ["@medusajs/framework", "@mercurjs/types", "pg"],
})
