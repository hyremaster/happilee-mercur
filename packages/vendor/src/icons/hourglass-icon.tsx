import type { SVGProps } from "react"

type HourglassIconProps = SVGProps<SVGSVGElement>

/**
 * Featured hourglass icon from Happilee session-expired empty state (Figma).
 * Includes the rounded frame + shadow treatment — use standalone, not inside FeaturedIcon.
 */
export const HourglassIcon = ({
  width = 60,
  height = 66,
  ...props
}: HourglassIconProps) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 60 66"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    {...props}
  >
    <rect
      x="1.5"
      y="0.5"
      width="55"
      height="55"
      rx="13.5"
      fill="white"
    />
    <rect
      x="1.5"
      y="0.5"
      width="55"
      height="55"
      rx="13.5"
      stroke="#D5D7DA"
    />
    <g filter="url(#filter0_dddi_hourglass)">
      <path
        d="M5 14C5 8.47715 9.47715 4 15 4H43C48.5229 4 53 8.47715 53 14V42C53 47.5229 48.5228 52 43 52H15C9.47715 52 5 47.5228 5 42V14Z"
        fill="white"
      />
      <path
        d="M43 3.5C48.799 3.5 53.5 8.20101 53.5 14V42C53.5 47.799 48.799 52.5 43 52.5H15C9.20101 52.5 4.5 47.799 4.5 42V14C4.5 8.20101 9.20101 3.5 15 3.5H43Z"
        stroke="black"
        strokeOpacity="0.08"
      />
      <path
        d="M28.9993 27.9997L24.0143 23.8455C23.2737 23.2283 22.9033 22.9197 22.6371 22.5414C22.4012 22.2062 22.226 21.8321 22.1195 21.4363C21.9993 20.9896 21.9993 20.5076 21.9993 19.5434V16.333M28.9993 27.9997L33.9844 23.8455C34.725 23.2283 35.0954 22.9197 35.3616 22.5414C35.5975 22.2062 35.7727 21.8321 35.8792 21.4363C35.9993 20.9896 35.9993 20.5076 35.9993 19.5434V16.333M28.9993 27.9997L24.0143 32.1539C23.2737 32.7711 22.9033 33.0797 22.6371 33.458C22.4012 33.7932 22.226 34.1672 22.1195 34.563C21.9993 35.0097 21.9993 35.4918 21.9993 36.4559V39.6663M28.9993 27.9997L33.9844 32.1539C34.725 32.7711 35.0954 33.0797 35.3616 33.458C35.5975 33.7932 35.7727 34.1672 35.8792 34.563C35.9993 35.0097 35.9993 35.4918 35.9993 36.4559V39.6663M19.666 16.333H38.3327M19.666 39.6663H38.3327"
        stroke="#EF4444"
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <filter
        id="filter0_dddi_hourglass"
        x="0"
        y="1"
        width="60"
        height="65"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="1" />
        <feGaussianBlur stdDeviation="1" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
        />
        <feBlend
          mode="normal"
          in2="BackgroundImageFix"
          result="effect1_dropShadow_hourglass"
        />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="3" />
        <feGaussianBlur stdDeviation="1.5" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
        />
        <feBlend
          mode="normal"
          in2="effect1_dropShadow_hourglass"
          result="effect2_dropShadow_hourglass"
        />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dx="1" dy="8" />
        <feGaussianBlur stdDeviation="2.5" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"
        />
        <feBlend
          mode="normal"
          in2="effect2_dropShadow_hourglass"
          result="effect3_dropShadow_hourglass"
        />
        <feBlend
          mode="normal"
          in="SourceGraphic"
          in2="effect3_dropShadow_hourglass"
          result="shape"
        />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="-2" />
        <feGaussianBlur stdDeviation="1" />
        <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
        />
        <feBlend
          mode="normal"
          in2="shape"
          result="effect4_innerShadow_hourglass"
        />
      </filter>
    </defs>
  </svg>
)
