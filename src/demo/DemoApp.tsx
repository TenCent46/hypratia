import { DemoCanvas } from './DemoCanvas';
import { DemoChat } from './DemoChat';
import { DemoTour } from './DemoTour';
import { SiteHeader, DOWNLOAD_URL } from '../web/SiteHeader';
import { SiteFooter } from '../web/SiteFooter';
import { useLocale } from '../web/LocaleProvider';

export function DemoApp() {
  const { t } = useLocale();
  return (
    <div className="demo-shell">
      <SiteHeader />

      <div className="demo-page-intro">
        <div>
          <h1 className="demo-page-title">
            {t('demo.title')}
            <span className="demo-mode-badge demo-mode-badge--inline">
              {t('demo.badge.static')}
            </span>
          </h1>
          <p className="demo-page-sub">{t('demo.intro')}</p>
        </div>
        <a className="demo-back-link" href="/">
          {t('demo.back')}
        </a>
      </div>

      <section
        className="demo-stage demo-stage-full"
        aria-label={t('stage.aria.demo')}
      >
        <div className="demo-stage-canvas">
          <DemoCanvas />
        </div>
        <div className="demo-stage-chat">
          <DemoChat />
        </div>
      </section>

      <div className="demo-page-outro">
        <p className="demo-page-outro-text">{t('demo.outro')}</p>
        <a className="demo-cta-primary" href={DOWNLOAD_URL}>
          {t('hero.cta.primary')}
        </a>
      </div>

      <SiteFooter />
      <DemoTour />
    </div>
  );
}
