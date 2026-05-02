import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';

/**
 * Animated mockup of the Hypratia desktop app — pure CSS / SVG / Framer Motion.
 * No real Hypratia state, no API calls. The same six-step timeline runs on a
 * loop while the section is in view.
 */

const STEP_MS = 1600;
const TOTAL_STEPS = 6; // 0..5
const TOAST_AT = 4;

type NodePos = { x: number; y: number; w: number; h: number };

const NODE_LAYOUT: Record<string, NodePos> = {
  pinned: { x: 30, y: 70, w: 220, h: 92 },
  idea: { x: 320, y: 32, w: 200, h: 80 },
  pdf: { x: 30, y: 220, w: 240, h: 104 },
  md: { x: 330, y: 230, w: 220, h: 96 },
};

type EdgeDef = { id: string; from: keyof typeof NODE_LAYOUT; to: keyof typeof NODE_LAYOUT; at: number };
const EDGES: EdgeDef[] = [
  { id: 'e-root-idea', from: 'pinned', to: 'idea', at: 1 },
  { id: 'e-root-pdf', from: 'pinned', to: 'pdf', at: 2 },
  { id: 'e-idea-md', from: 'idea', to: 'md', at: 3 },
];

const NODE_APPEAR: Record<keyof typeof NODE_LAYOUT, number> = {
  pinned: 0,
  idea: 1,
  pdf: 2,
  md: 3,
};

type Msg = { id: string; role: 'user' | 'assistant'; at: number; key: string };
const MESSAGES: Msg[] = [
  { id: 'm1', role: 'user', at: 0, key: 'v2.mock.chat.user1' },
  { id: 'm2', role: 'assistant', at: 1, key: 'v2.mock.chat.assistant1' },
  { id: 'm3', role: 'user', at: 2, key: 'v2.mock.chat.user2' },
  { id: 'm4', role: 'assistant', at: 3, key: 'v2.mock.chat.assistant2' },
];

function useAutoStep() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => setPaused(!entries[0].isIntersecting),
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % TOTAL_STEPS);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [paused, reducedMotion]);

  return { step, ref };
}

export function InteractiveAppDemo() {
  const { t } = useLocale();
  const { step, ref } = useAutoStep();

  return (
    <section id="demo" ref={ref} className="relative px-4 pb-24 pt-10 sm:px-6">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
          {t('v2.demo.eyebrow')}
        </p>
        <h2 className="font-display text-balance text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[40px]">
          {t('v2.demo.title')}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-[15px] text-white/55">
          {t('v2.demo.sub')}
        </p>
      </div>

      <div className="mx-auto max-w-[1100px]">
        <div className="glass-thick relative overflow-hidden rounded-[22px] ring-1 ring-white/[0.04]">
          {/* macOS window chrome */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 truncate text-[12px] text-white/55">
              {t('v2.mock.chat.title')}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
            <MockCanvas step={step} />
            <MockChat step={step} />
          </div>

          <AnimatePresence>
            {step === TOAST_AT ? (
              <motion.div
                key="toast"
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 14, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.2, 0.8, 0.25, 1] }}
                className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-ink-850/90 px-4 py-2 text-[12px] font-medium text-white/90 shadow-xl backdrop-blur-md"
              >
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-glow-mint align-middle" />
                {t('v2.mock.toast.export')}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Canvas -------------------- */

function MockCanvas({ step }: { step: number }) {
  const visibleNodes = (Object.keys(NODE_LAYOUT) as Array<keyof typeof NODE_LAYOUT>).filter(
    (id) => step >= NODE_APPEAR[id],
  );
  const visibleEdges = EDGES.filter((e) => step >= e.at);

  return (
    <div className="relative hidden h-[420px] overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(139,124,255,0.10),transparent_60%)] lg:block">
      {/* dot grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-50"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* edges */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 600 420"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="edge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(139,124,255,0.85)" />
            <stop offset="100%" stopColor="rgba(90,200,250,0.65)" />
          </linearGradient>
        </defs>
        {EDGES.map((e) => {
          const a = NODE_LAYOUT[e.from];
          const b = NODE_LAYOUT[e.to];
          const ax = a.x + a.w / 2;
          const ay = a.y + a.h;
          const bx = b.x + b.w / 2;
          const by = b.y;
          const cx1 = ax;
          const cy1 = ay + 60;
          const cx2 = bx;
          const cy2 = by - 60;
          const visible = visibleEdges.some((v) => v.id === e.id);
          return (
            <motion.path
              key={e.id}
              d={`M${ax},${ay} C${cx1},${cy1} ${cx2},${cy2} ${bx},${by}`}
              fill="none"
              stroke="url(#edge-grad)"
              strokeWidth="1.6"
              strokeLinecap="round"
              initial={false}
              animate={
                visible
                  ? { pathLength: 1, opacity: 0.9 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{ duration: 0.55, ease: [0.2, 0.8, 0.25, 1] }}
            />
          );
        })}
      </svg>

      {/* nodes */}
      <div className="relative h-full w-full">
        {visibleNodes.map((id) => (
          <NodeCard key={id} id={id} appearedAt={NODE_APPEAR[id]} step={step} />
        ))}
      </div>

      {/* fake cursor — drifts toward the latest interaction */}
      <FakeCursor step={step} />
    </div>
  );
}

function NodeCard({
  id,
  appearedAt,
  step,
}: {
  id: keyof typeof NODE_LAYOUT;
  appearedAt: number;
  step: number;
}) {
  const pos = NODE_LAYOUT[id];
  const justAppeared = step === appearedAt;
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.25, 1] }}
      className={`absolute glass rounded-2xl p-3 ${
        justAppeared ? 'ring-glow' : ''
      }`}
      style={{
        left: `${(pos.x / 600) * 100}%`,
        top: `${(pos.y / 420) * 100}%`,
        width: `${(pos.w / 600) * 100}%`,
        height: `${(pos.h / 420) * 100}%`,
        minWidth: 160,
      }}
    >
      <NodeBody id={id} />
    </motion.div>
  );
}

function NodeBody({ id }: { id: keyof typeof NODE_LAYOUT }) {
  const { t } = useLocale();
  if (id === 'pinned') {
    return (
      <>
        <div className="mb-1 flex items-center gap-1.5">
          <PinGlyph />
          <span className="font-display text-[12.5px] font-semibold text-white/95">
            {t('v2.mock.node.pinned.title')}
          </span>
        </div>
        <p className="text-[11.5px] leading-snug text-white/65">
          {t('v2.mock.node.pinned.body')}
        </p>
      </>
    );
  }
  if (id === 'idea') {
    return (
      <>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-glow-violet" />
          <span className="font-display text-[12.5px] font-semibold text-white/95">
            {t('v2.mock.node.idea.title')}
          </span>
        </div>
        <p className="text-[11.5px] leading-snug text-white/65">
          {t('v2.mock.node.idea.body')}
        </p>
      </>
    );
  }
  if (id === 'pdf') {
    return (
      <>
        <div className="mb-1.5 flex items-center gap-2">
          <FileBadge label="PDF" color="#ff5f57" />
          <span className="truncate font-display text-[12.5px] font-semibold text-white/95">
            {t('v2.mock.node.pdf.title')}
          </span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug text-white/55">
          {t('v2.mock.node.pdf.preview')}
        </p>
      </>
    );
  }
  return (
    <>
      <div className="mb-1.5 flex items-center gap-2">
        <FileBadge label="MD" color="#5ac8fa" />
        <span className="truncate font-display text-[12.5px] font-semibold text-white/95">
          {t('v2.mock.node.md.title')}
        </span>
      </div>
      <p className="line-clamp-2 text-[11px] leading-snug text-white/55">
        {t('v2.mock.node.md.preview')}
      </p>
    </>
  );
}

function FileBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-grid h-4 min-w-[28px] place-items-center rounded px-1 text-[8.5px] font-bold tracking-widest text-white"
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

function PinGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 4l6 6-4 1-3 7-3-3-5 5 5-5-3-3 7-3 1-4z"
        stroke="rgba(255,181,71,0.95)"
        strokeWidth="1.8"
        fill="rgba(255,181,71,0.18)"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FakeCursor({ step }: { step: number }) {
  const targets: Record<number, { x: number; y: number }> = {
    0: { x: 18, y: 38 },
    1: { x: 70, y: 16 },
    2: { x: 22, y: 70 },
    3: { x: 75, y: 70 },
    4: { x: 50, y: 92 },
    5: { x: 50, y: 92 },
  };
  const pos = targets[step] ?? targets[0];
  return (
    <motion.div
      animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.25, 1] }}
      className="pointer-events-none absolute -ml-2 -mt-2"
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M3 2l14 7-6 1.5L8 18 3 2z"
          fill="rgba(255,255,255,0.95)"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="0.8"
        />
      </svg>
    </motion.div>
  );
}

/* -------------------- Chat -------------------- */

function MockChat({ step }: { step: number }) {
  const { t } = useLocale();
  return (
    <div className="flex h-[420px] min-w-0 flex-col border-t border-white/[0.06] bg-ink-900/40 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="truncate font-display text-[12.5px] font-semibold text-white/85">
          {t('v2.mock.chat.title')}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/55">
          {t('chat.badge')}
        </span>
      </div>
      <div className="flex-1 space-y-4 overflow-hidden px-4 py-4">
        <AnimatePresence initial={false}>
          {MESSAGES.filter((m) => step >= m.at).map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.25, 1] }}
              className="space-y-1"
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                  m.role === 'user' ? 'text-white/40' : 'text-glow-violet/80'
                }`}
              >
                {m.role}
              </span>
              <p className="text-[12.5px] leading-relaxed text-white/85">
                {t(m.key)}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-white/35">
          {t('chat.composer.disabled')}
        </div>
      </div>
    </div>
  );
}
