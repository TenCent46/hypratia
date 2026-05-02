import { HypratiaIcon } from './HypratiaIcon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLocale } from './LocaleProvider';

/**
 * Sticky brand bar shared by `/` (landing) and `/demo`.
 *
 * Visual classes (.demo-header, .demo-brand, .demo-download-btn) live in
 * src/web/styles.css and are re-used as-is on both pages.
 */
export const DOWNLOAD_URL = '#';
export const REPO_URL = 'https://github.com/TenCent46/hypratia';

type SiteHeaderProps = {
  /** Where the wordmark links to. Default: `/`. */
  homeHref?: string;
};

export function SiteHeader({ homeHref = '/' }: SiteHeaderProps) {
  const { t } = useLocale();
  return (
    <header className="demo-header">
      <a className="demo-brand" href={homeHref} aria-label={t('header.aria.home')}>
        <HypratiaIcon size={28} />
        <span className="demo-brand-name">Hypratia</span>
      </a>
      <nav className="demo-header-actions" aria-label="Primary">
        <LanguageSwitcher />
        <a
          className="demo-header-icon-btn"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t('header.aria.github')}
          title={t('header.title.github')}
        >
          <GitHubMark />
        </a>
        <a className="demo-download-btn" href={DOWNLOAD_URL}>
          {t('header.download')}
        </a>
      </nav>
    </header>
  );
}

function GitHubMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.11.83-.26.83-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.31-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.31-.54-1.54.12-3.21 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.67.25 2.9.12 3.21.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3" />
    </svg>
  );
}
