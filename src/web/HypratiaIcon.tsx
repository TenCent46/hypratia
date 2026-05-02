import { useId } from 'react';

type HypratiaIconProps = {
  size?: number;
  /** Adds a soft drop-shadow — looks right at hero sizes (~120px+). */
  shadow?: boolean;
  /** Optional className override. */
  className?: string;
};

/**
 * Hypratia app-icon mark — Freeform-style: white squircle base, warm
 * orange circle, translucent blue rounded rect, and a navy curve with
 * five memory-graph nodes.
 */
export function HypratiaIcon({
  size = 28,
  shadow = false,
  className,
}: HypratiaIconProps) {
  const reactId = useId();
  const clipId = `hyp-clip-${reactId.replace(/:/g, '')}`;
  const cls = [
    'hyp-icon',
    shadow ? 'hyp-icon--shadow' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Hypratia"
      className={cls}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="1024" height="1024" rx="232" ry="232" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="1024" height="1024" fill="#ffffff" />
        <circle
          cx="370"
          cy="570"
          r="225"
          fill="#ffb547"
          fillOpacity="0.92"
        />
        <rect
          x="375"
          y="315"
          width="430"
          height="380"
          rx="60"
          fill="#5ac8fa"
          fillOpacity="0.78"
        />
        <path
          d="M 120 740 C 280 580, 400 510, 520 510 S 780 380, 910 250"
          fill="none"
          stroke="#14254a"
          strokeWidth="32"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="170" cy="700" r="26" fill="#14254a" />
        <circle cx="340" cy="560" r="26" fill="#14254a" />
        <circle cx="520" cy="510" r="26" fill="#14254a" />
        <circle cx="700" cy="420" r="26" fill="#14254a" />
        <circle cx="880" cy="280" r="26" fill="#14254a" />
      </g>
      <rect
        width="1024"
        height="1024"
        rx="232"
        ry="232"
        fill="none"
        stroke="rgba(20, 37, 74, 0.06)"
        strokeWidth="2"
      />
    </svg>
  );
}
