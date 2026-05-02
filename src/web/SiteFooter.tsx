import { DOWNLOAD_URL, REPO_URL } from './SiteHeader';
import { useLocale } from './LocaleProvider';

export function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer className="demo-footer">
      <span>{t('footer.copy')}</span>
      <span className="demo-footer-links">
        <a
          className="demo-footer-link"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
        >
          {t('footer.github')}
        </a>
        <a className="demo-footer-link" href={DOWNLOAD_URL}>
          {t('footer.download')}
        </a>
      </span>
    </footer>
  );
}
