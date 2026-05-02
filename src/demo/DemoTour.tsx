import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocale } from '../web/LocaleProvider';

type TourStep = {
  titleKey: string;
  bodyKey: string;
  /** CSS selector to spotlight. Tour card stays centered. */
  target?: string;
};

const STEPS: TourStep[] = [
  { titleKey: 'tour.welcome.title', bodyKey: 'tour.welcome.body' },
  {
    titleKey: 'tour.add.title',
    bodyKey: 'tour.add.body',
    target: '[data-tour="add-memo"]',
  },
  {
    titleKey: 'tour.paste.title',
    bodyKey: 'tour.paste.body',
    target: '[data-tour="canvas"]',
  },
  { titleKey: 'tour.files.title', bodyKey: 'tour.files.body' },
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
  const { t, tf } = useLocale();
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
        aria-label={t('tour.skip')}
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
          {tf('tour.step', { n: step + 1, total })}
        </span>
        <h3 className="demo-tour-title">{t(current.titleKey)}</h3>
        <p className="demo-tour-body">{t(current.bodyKey)}</p>
        <div className="demo-tour-actions">
          {!isLast ? (
            <button
              type="button"
              className="demo-tour-skip"
              onClick={onSkip}
            >
              {t('tour.skip')}
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
            {isLast ? t('tour.gotIt') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
