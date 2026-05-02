import { motion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';
import { HypratiaIcon } from '../../web/HypratiaIcon';

const REPO_URL = 'https://github.com/TenCent46/hypratia';
const DOWNLOAD_URL = '#';

export function HeroSection() {
  const { t } = useLocale();
  return (
    <section
      id="top"
      className="relative px-6 pt-40 pb-20 sm:pt-48 lg:pt-56"
    >
      <div className="mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.25, 1] }}
          className="mb-9 inline-flex"
        >
          <div className="ring-glow rounded-[28%]">
            <HypratiaIcon size={112} shadow />
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-glow-violet animate-pulse-soft" />
          {t('v2.hero.eyebrow')}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.8, 0.25, 1] }}
          className="font-display text-balance text-[44px] font-semibold leading-[1.02] tracking-tightest text-white sm:text-[64px] lg:text-[80px]"
        >
          <span className="block">{t('v2.hero.headline.l1')}</span>
          <span className="block gradient-text">{t('v2.hero.headline.l2')}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mx-auto mt-7 max-w-[640px] text-balance text-[16px] leading-[1.55] text-white/65 sm:text-[18px]"
        >
          {t('v2.hero.sub')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.32 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href={DOWNLOAD_URL}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[14px] font-semibold text-ink-950 shadow-[0_18px_50px_-16px_rgba(255,255,255,0.55)] transition hover:-translate-y-0.5 hover:bg-white/95"
          >
            <DownloadGlyph />
            {t('v2.hero.cta.download')}
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-5 py-3 text-[14px] font-medium text-white/85 backdrop-blur-md transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <StarGlyph />
            {t('v2.hero.cta.github')}
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="mt-7 text-[12px] tracking-[0.04em] text-white/40"
        >
          {t('v2.hero.meta')}
        </motion.p>
      </div>
    </section>
  );
}

function DownloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function StarGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.95 6.6 7.05.66-5.35 4.84 1.6 6.9L12 17.77l-6.25 3.73 1.6-6.9L2 9.76l7.05-.66L12 2.5z" />
    </svg>
  );
}
