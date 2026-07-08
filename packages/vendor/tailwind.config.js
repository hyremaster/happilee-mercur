import happileePreset from "@happilee-app/tailwind-preset";

export default {
  presets: [happileePreset],
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../apps/vendor/src/**/*.{js,ts,jsx,tsx}",
  ],
};
