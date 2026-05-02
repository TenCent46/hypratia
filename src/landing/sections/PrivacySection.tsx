import { motion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';

const POINTS = [
  'v2.privacy.point.local',
  'v2.privacy.point.byok',
  'v2.privacy.point.notelemetry',
  'v2.privacy.point.markdown',
] as const;

export function PrivacySection() {
  const { t } = useLocale();
  return (
    <section id="privacy" className="relative px-6 py-28">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-[420px] max-w-3xl -translate-y-1/2 rounded-full bg-glow-blue/[0.06] blur-3xl"
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.25, 1] }}
        className="relative mx-auto max-w-3xl text-center"
      >
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
          {t('v2.privacy.eyebrow')}
        </p>
        <h2 className="font-serif text-balance text-[32px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[44px]">
          {t('v2.privacy.title')}
        </h2>
        <p className="mx-auto mt-7 max-w-2xl text-balance text-[16px] leading-[1.65] text-white/60">
          {t('v2.privacy.body')}
        </p>

        <ul className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
          {POINTS.map((k) => (
            <li
              key={k}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12.5px] font-medium text-white/75 backdrop-blur-md"
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-glow-mint align-middle" />
              {t(k)}
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
