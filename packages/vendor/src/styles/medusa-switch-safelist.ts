/**
 * Tailwind content safelist for @medusajs/ui Switch.
 *
 * Those size/state classes live only inside the UI package. If the package is
 * outside the scan path (or @source fails to resolve the bun symlink), the
 * switch track collapses to a circle. Keep this file so the utilities always
 * enter the vendor CSS bundle.
 */
export const MEDUSA_SWITCH_SAFELIST = [
  "h-[16px]",
  "h-[18px]",
  "h-[12px]",
  "h-[14px]",
  "w-[28px]",
  "w-[32px]",
  "w-[12px]",
  "w-[14px]",
  "bg-ui-bg-switch-off",
  "hover:bg-ui-bg-switch-off-hover",
  "data-[state=unchecked]:hover:after:bg-switch-off-hover-gradient",
  "before:shadow-details-switch-background",
  "focus-visible:shadow-details-switch-background-focus",
  "data-[state=checked]:bg-ui-bg-interactive",
  "bg-ui-fg-on-color",
  "shadow-details-switch-handle",
  "data-[state=checked]:translate-x-3.5",
  "data-[state=checked]:translate-x-4",
  "data-[state=unchecked]:translate-x-0.5",
] as const
