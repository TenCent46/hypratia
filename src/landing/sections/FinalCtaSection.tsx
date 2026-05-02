import { motion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';

const REPO_URL = 'https://github.com/TenCent46/hypratia';
const DOWNLOAD_URL = '#';

export function FinalCtaSection() {
  const { t } = useLocale();
  return (
    <section className="relative overflow-hidden px-6 py-32">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-[520px] max-w-2xl -translate-y-1/2 rounded-full bg-glow-violet/[0.10] blur-[120px]"
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.25, 1] }}
        className="relative mx-auto max-w-3xl text-center"
      >
        <h2 className="font-serif text-balance text-[36px] font-semibold leading-[1.1] tracking-tight text-white sm:text-[56px]">
          {t('v2.finalcta.title')}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-balance text-[16px] text-white/55">
          {t('v2.finalcta.sub')}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DOWNLOAD_URL}
            className="rounded-full bg-white px-6 py-3.5 text-[14px] font-semibold text-ink-950 shadow-[0_18px_50px_-16px_rgba(255,255,255,0.55)] transition hover:-translate-y-0.5 hover:bg-white/95"
          >
            {t('v2.finalcta.download')}
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-[14px] font-medium text-white/85 backdrop-blur-md transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            {t('v2.finalcta.github')}
          </a>
        </div>
      </motion.div>
    </section>
  );
}
