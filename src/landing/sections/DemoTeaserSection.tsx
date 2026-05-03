import { motion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';

const DEMO_URL = '/demo';

/**
 * Replaces the inline animated InteractiveAppDemo on the landing top.
 * The full simulation lives at `/demo` (a separate Vite entry — see
 * vite.config.ts and vercel.json rewrites). Here we show a quiet,
 * clickable preview frame so the visitor knows what they'd open.
 */
export function DemoTeaserSection() {
  const { t } = useLocale();
  return (
    <section id="demo" className="relative px-6 py-28 sm:py-36">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-[420px] max-w-3xl -translate-y-1/2 rounded-full bg-glow-blue/[0.08] blur-[140px]"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.25, 1] }}
        className="relative mx-auto mb-12 max-w-3xl text-center"
      >
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
          {t('v2.demo.eyebrow')}
        </p>
        <h2 className="font-display text-balance text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[40px]">
          {t('v2.demo.title')}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-balance text-[15px] leading-[1.55] text-white/60 sm:text-[16px]">
          {t('v2.demo.sub')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.2, 0.8, 0.25, 1] }}
        className="relative mx-auto max-w-[1040px]"
      >
        <a
          href={DEMO_URL}
          aria-label={t('v2.demo.cta')}
          className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-3 backdrop-blur-md transition hover:border-white/20"
        >
          <PreviewFrame
            chatLabel={t('v2.demo.preview.chat')}
            canvasLabel={t('v2.demo.preview.canvas')}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-t from-ink-950/80 via-transparent to-transparent opacity-90"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-6 pb-7 sm:pb-9">
            <span className="rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-ink-950 shadow-[0_18px_50px_-16px_rgba(255,255,255,0.55)] transition group-hover:-translate-y-0.5">
              {t('v2.demo.cta')} →
            </span>
            <span className="text-[11px] tracking-[0.04em] text-white/45">
              {t('v2.demo.note')}
            </span>
          </div>
        </a>
      </motion.div>
    </section>
  );
}

function PreviewFrame({
  chatLabel,
  canvasLabel,
}: {
  chatLabel: string;
  canvasLabel: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink-950/80">
      {/* macOS title bar */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
        <span className="ml-3 text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
          hypratia.app
        </span>
      </div>

      <div className="grid h-[300px] grid-cols-12 sm:h-[420px]">
        {/* Canvas pane (70%) */}
        <div className="relative col-span-12 border-r border-white/[0.05] sm:col-span-8">
          <DotGrid />
          <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-ink-950/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/55 backdrop-blur">
            {canvasLabel}
          </span>

          {/* Stylised nodes */}
          <PreviewNode
            className="left-[12%] top-[18%]"
            tone="violet"
            title="Spatial memory"
            line1="Treat each pinned answer"
            line2="as a node — relations are edges."
          />
          <PreviewNode
            className="left-[42%] top-[34%]"
            tone="blue"
            title="PDF · paper.pdf"
            line1="p. 5 — “the canvas is"
            line2="a long-term store of context.”"
          />
          <PreviewNode
            className="left-[16%] top-[56%]"
            tone="mint"
            title="Daily · 2026-05-03"
            line1="Three threads to revisit"
            line2="before the Friday review."
          />
          <PreviewEdge from={{ x: 22, y: 26 }} to={{ x: 50, y: 42 }} />
          <PreviewEdge from={{ x: 26, y: 56 }} to={{ x: 50, y: 50 }} />
        </div>

        {/* Chat pane (30%) */}
        <div className="relative col-span-12 hidden flex-col bg-ink-950/60 sm:col-span-4 sm:flex">
          <span className="m-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-ink-950/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">
            {chatLabel}
          </span>
          <div className="flex flex-1 flex-col gap-2.5 px-3 pb-3 text-[11.5px] leading-[1.5]">
            <ChatBubble role="user">
              How should the canvas remember context?
            </ChatBubble>
            <ChatBubble role="assistant">
              Treat each pinned answer as a node. Position is the index — relations are edges.
            </ChatBubble>
            <ChatBubble role="user">Pin that answer.</ChatBubble>
            <ChatBubble role="assistant">
              Pinned to the canvas. Linked to the PDF citation.
            </ChatBubble>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewNode({
  className,
  tone,
  title,
  line1,
  line2,
}: {
  className: string;
  tone: 'violet' | 'blue' | 'mint';
  title: string;
  line1: string;
  line2: string;
}) {
  const accent: Record<typeof tone, string> = {
    violet: 'border-glow-violet/40 shadow-[0_18px_50px_-16px_rgba(168,150,255,0.35)]',
    blue: 'border-glow-blue/40 shadow-[0_18px_50px_-16px_rgba(120,180,255,0.32)]',
    mint: 'border-glow-mint/40 shadow-[0_18px_50px_-16px_rgba(140,235,200,0.30)]',
  };
  return (
    <div
      className={`absolute w-[180px] rounded-xl border bg-white/[0.04] px-3 py-2 backdrop-blur-md ${accent[tone]} ${className}`}
    >
      <div className="text-[10.5px] font-semibold tracking-tight text-white/85">
        {title}
      </div>
      <div className="mt-1 text-[10px] leading-snug text-white/55">
        {line1}
        <br />
        {line2}
      </div>
    </div>
  );
}

function PreviewEdge({
  from,
  to,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={`M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ChatBubble({
  role,
  children,
}: {
  role: 'user' | 'assistant';
  children: string;
}) {
  if (role === 'user') {
    return (
      <div className="self-end max-w-[88%] rounded-2xl rounded-br-sm bg-white/[0.10] px-3 py-2 text-white/90">
        {children}
      </div>
    );
  }
  return (
    <div className="self-start max-w-[88%] rounded-2xl rounded-bl-sm bg-white/[0.04] px-3 py-2 text-white/75">
      {children}
    </div>
  );
}

function DotGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
      aria-hidden
    />
  );
}
