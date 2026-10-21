import { defineConfig } from "tsup"

export default defineConfig((options) => ({
    entry: ["src/index.ts"],
    format: ["cjs"],
    dts: true,
    // Clean only one-off builds. `tsup --watch` (turbo dev) starts while other
    // tasks read dist/; wiping it then breaks them (ENOENT / unresolved entry).
    clean: !options.watch,
}))
