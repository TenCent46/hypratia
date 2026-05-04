type HypratiaIconProps = {
  size?: number;
  /** Adds a soft drop-shadow — looks right at hero sizes (~120px+). */
  shadow?: boolean;
  /** Optional className override. */
  className?: string;
};

/**
 * Hypratia app-icon mark. Backed by the same source artwork that drives
 * the Tauri platform icons (`src-tauri/icons/`) — kept here as a 256×256
 * raster (`public/hypratia-icon.png`) so the brand stays identical
 * between the Mac app's Dock icon and the web surfaces (favicon, nav,
 * hero, footer). The original 1024×1024 PNG was downscaled to 256² to
 * stay under ~40 kB; that's enough for a 112 px hero on Retina (2×).
 */
export function HypratiaIcon({
  size = 28,
  shadow = false,
  className,
}: HypratiaIconProps) {
  const cls = [
    'hyp-icon',
    shadow ? 'hyp-icon--shadow' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <img
      src="/hypratia-icon.png"
      width={size}
      height={size}
      alt="Hypratia"
      decoding="async"
      loading="eager"
      className={cls}
      draggable={false}
      style={{ display: 'block' }}
    />
  );
}
