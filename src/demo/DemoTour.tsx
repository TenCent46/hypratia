import { useEffect, useLayoutEffect, useState } from 'react';

type TourStep = {
  title: string;
  body: string;
  /** CSS selector to spotlight. Tour card stays centered. */
  target?: string;
};

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Hypratia',
    body: 'A memory canvas for your conversations. This is a live demo — no AI calls happen and nothing leaves your browser.',
  },
  {
    title: 'Add a memo',
    body: 'Click + Add memo to drop a new Markdown node on the canvas. Drag it anywhere.',
    target: '[data-tour="add-memo"]',
  },
  {
    title: 'Paste anything',
    body: 'Copy any image (e.g. ⌘⇧4 on Mac), then press ⌘V on the canvas. Pasted text becomes a memo, pasted images become image nodes.',
    target: '[data-tour="canvas"]',
  },
  {
    title: 'PDF, PPTX, MD — all supported',
    body: 'In the full Mac app, drop PDFs, PowerPoint decks, or Markdown files onto the canvas. Hypratia parses them, indexes content, and links them to your conversations.',
  },
];

const STORAGE_KEY = 'hypratia-demo-tour-seen';

export function DemoTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // private mode / blocked storage — show the tour anyway
    }
    if (seen) return;
    const t = window.setTimeout(() => setStep(0), 700);
    return () => window.clearTimeout(t);
  }, []);

  if (step === null || step >= STEPS.length) return null;

  function done() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setStep(null);
  }
  function next() {
    if (step !== null && step + 1 < STEPS.length) setStep(step + 1);
    else done();
  }

  return (
    <TourOverlay
      step={step}
      total={STEPS.length}
      current={STEPS[step]}
      onSkip={done}
      onNext={next}
    />
  );
}

type OverlayProps = {
  step: number;
  total: number;
  current: TourStep;
  onSkip: () => void;
  onNext: () => void;
};

function TourOverlay({ step, total, current, onSkip, onNext }: OverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!current.target) {
      setRect(null);
      return;
    }
    function update() {
      const el = document.querySelector(current.target!);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    }
    update();
    const interval = window.setInterval(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [current.target]);

  const isLast = step + 1 === total;

  return (
    <div className="demo-tour-overlay" role="dialog" aria-modal="true">
      <button
        type="button"
        className="demo-tour-backdrop"
        onClick={onSkip}
        aria-label="Skip tour"
      />
      {rect ? (
        <div
          className="demo-tour-glow"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
          aria-hidden
        />
      ) : null}
      <div className="demo-tour-card">
        <div className="demo-tour-progress" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`demo-tour-dot${i === step ? ' active' : ''}${
                i < step ? ' done' : ''
              }`}
            />
          ))}
        </div>
        <span className="demo-tour-meta">
          Step {step + 1} of {total}
        </span>
        <h3 className="demo-tour-title">{current.title}</h3>
        <p className="demo-tour-body">{current.body}</p>
        <div className="demo-tour-actions">
          {!isLast ? (
            <button
              type="button"
              className="demo-tour-skip"
              onClick={onSkip}
            >
              Skip tour
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="demo-tour-next"
            onClick={onNext}
            autoFocus
          >
            {isLast ? 'Got it' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
