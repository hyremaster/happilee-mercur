import happileePreset from "@happilee-app/tailwind-preset";

export default {
  presets: [happileePreset],
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../apps/vendor/src/**/*.{js,ts,jsx,tsx}",
    // Medusa UI Switch (and other primitives) ship size/state classes only
    // inside the package; without this they never enter the CSS bundle and
    // switches render as overlapping circles instead of a pill track.
    "./node_modules/@medusajs/ui/dist/esm/**/*.{js,mjs}",
  ],
};
