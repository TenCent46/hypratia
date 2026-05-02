/**
 * Aurora-style backdrop — three soft color blobs, a subtle grid, and an
 * SVG-noise overlay layered behind the entire page. Pure CSS / SVG, no
 * runtime cost.
 */
export function Backdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950"
      aria-hidden
    >
      {/* base radial */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,124,255,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(90,200,250,0.10),transparent_45%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,181,71,0.08),transparent_40%)]" />

      {/* drifting aurora ribbons */}
      <div className="absolute -top-40 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-glow-violet/25 blur-[140px] animate-aurora-drift" />
      <div className="absolute top-[40%] -left-40 h-[520px] w-[820px] rounded-full bg-glow-blue/20 blur-[140px] animate-aurora-drift [animation-delay:-6s]" />
      <div className="absolute top-[60%] -right-40 h-[460px] w-[760px] rounded-full bg-glow-orange/15 blur-[140px] animate-aurora-drift [animation-delay:-12s]" />

      {/* faint grid */}
      <div className="absolute inset-0 grid-bg opacity-[0.18] mask-fade-edge" />

      {/* film noise */}
      <div className="absolute inset-0 bg-noise-texture opacity-[0.04] mix-blend-overlay" />
    </div>
  );
}
