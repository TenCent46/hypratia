import { DemoCanvas } from '../demo/DemoCanvas';
import { DemoChat } from '../demo/DemoChat';
import { SiteHeader, DOWNLOAD_URL } from '../web/SiteHeader';
import { SiteFooter } from '../web/SiteFooter';
import { HypratiaIcon } from '../web/HypratiaIcon';
import { useLocale } from '../web/LocaleProvider';

const FEATURE_KEYS = [
  { titleKey: 'features.localFirst.title', descKey: 'features.localFirst.desc' },
  { titleKey: 'features.macNative.title', descKey: 'features.macNative.desc' },
  { titleKey: 'features.canvas.title', descKey: 'features.canvas.desc' },
] as const;

const STEP_KEYS = [
  { titleKey: 'how.step1.title', descKey: 'how.step1.desc' },
  { titleKey: 'how.step2.title', descKey: 'how.step2.desc' },
  { titleKey: 'how.step3.title', descKey: 'how.step3.desc' },
  { titleKey: 'how.step4.title', descKey: 'how.step4.desc' },
] as const;

export function LandingApp() {
  const { t } = useLocale();
  return (
    <div className="demo-shell">
      <SiteHeader />

      <section className="demo-hero">
        <div className="demo-hero-icon" aria-hidden>
          <HypratiaIcon size={132} shadow />
        </div>
        <p className="demo-hero-eyebrow">{t('hero.eyebrow')}</p>
        <h1 className="demo-hero-title">
          {t('hero.title.line1')}
          <br />
          {t('hero.title.line2')}
        </h1>
        <p className="demo-hero-sub">{t('hero.sub')}</p>
        <div className="demo-cta-row">
          <a className="demo-cta-primary" href={DOWNLOAD_URL}>
            {t('hero.cta.primary')}
          </a>
          <a className="demo-cta-secondary" href="/demo">
            {t('hero.cta.secondary')}
          </a>
        </div>
        <p className="demo-cta-meta">{t('hero.cta.meta')}</p>
      </section>

      <section
        className="demo-stage demo-stage-preview"
        aria-label={t('stage.aria.preview')}
      >
        <div className="demo-stage-canvas">
          <DemoCanvas />
        </div>
        <div className="demo-stage-chat">
          <DemoChat />
        </div>
      </section>

      <div className="demo-section-head">
        <p className="demo-section-eyebrow">{t('features.eyebrow')}</p>
        <h2 className="demo-section-title">{t('features.title')}</h2>
      </div>
      <section className="demo-features" aria-label={t('features.aria')}>
        {FEATURE_KEYS.map(({ titleKey, descKey }) => (
          <article key={titleKey} className="demo-feature">
            <h3 className="demo-feature-title">{t(titleKey)}</h3>
            <p className="demo-feature-desc">{t(descKey)}</p>
          </article>
        ))}
      </section>

      <div className="demo-section-head">
        <p className="demo-section-eyebrow">{t('how.eyebrow')}</p>
        <h2 className="demo-section-title">{t('how.title')}</h2>
      </div>
      <section className="demo-howitworks" aria-label={t('how.aria')}>
        {STEP_KEYS.map(({ titleKey, descKey }, i) => (
          <article key={titleKey} className="demo-step">
            <span className="demo-step-num" aria-hidden>
              {i + 1}
            </span>
            <h3 className="demo-step-title">{t(titleKey)}</h3>
            <p className="demo-step-desc">{t(descKey)}</p>
          </article>
        ))}
      </section>

      <SiteFooter />
    </div>
  );
}
