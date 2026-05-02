import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HypratiaIcon } from '../../web/HypratiaIcon';
import { useLocale } from '../../web/LocaleProvider';
import { LOCALES, LOCALE_LABELS, type Locale } from '../../web/i18n';

const SHORT_LABELS: Record<Locale, string> = {
  en: 'EN',
  ja: 'JA',
  zh: 'ZH',
};

const REPO_URL = 'https://github.com/TenCent46/hypratia';
const DOWNLOAD_URL = '#';

export function LandingNav() {
  const { t, locale, setLocale } = useLocale();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.25, 1] }}
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-5"
    >
      <nav
        className={`flex items-center gap-2 rounded-full pl-3 pr-1.5 py-1.5 transition-all duration-300 ${
          scrolled
            ? 'glass-thick shadow-[0_18px_60px_-24px_rgba(0,0,0,0.8)]'
            : 'glass'
        }`}
        aria-label="Primary"
      >
        <a
          href="#top"
          className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 text-white/95 transition hover:text-white"
          aria-label={t('header.aria.home')}
        >
          <HypratiaIcon size={26} />
          <span className="font-display text-[14px] font-semibold tracking-tight">
            Hypratia
          </span>
        </a>

        <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />

        <ul className="hidden items-center gap-0.5 sm:flex">
          {[
            ['#demo', t('nav.demo')],
            ['#features', t('nav.features')],
            ['#privacy', t('nav.privacy')],
            ['#pricing', t('nav.pricing')],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="rounded-full px-3 py-1.5 text-[13px] font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5">
          <div
            className="hidden items-center rounded-full bg-white/[0.04] p-0.5 sm:flex"
            role="group"
            aria-label={t('lang.aria.switcher')}
          >
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                aria-pressed={l === locale}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition ${
                  l === locale
                    ? 'bg-white/[0.10] text-white'
                    : 'text-white/45 hover:text-white/85'
                }`}
                title={LOCALE_LABELS[l]}
              >
                {SHORT_LABELS[l]}
              </button>
            ))}
          </div>

          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full p-2 text-white/55 transition hover:bg-white/[0.05] hover:text-white sm:inline-flex"
            aria-label={t('header.aria.github')}
            title={t('header.title.github')}
          >
            <GitHubMark />
          </a>

          <a
            href={DOWNLOAD_URL}
            className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink-950 shadow-[0_6px_18px_-6px_rgba(255,255,255,0.5)] transition hover:bg-white/90"
          >
            {t('nav.download')}
          </a>
        </div>
      </nav>
    </motion.header>
  );
}

function GitHubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.11.83-.26.83-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.31-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.31-.54-1.54.12-3.21 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.67.25 2.9.12 3.21.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3" />
    </svg>
  );
}
