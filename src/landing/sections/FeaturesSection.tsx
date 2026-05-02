import { motion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';

const FEATURES = [
  {
    titleKey: 'v2.features.spatial.title',
    descKey: 'v2.features.spatial.desc',
    glow: 'from-glow-violet/40',
    icon: 'spatial',
  },
  {
    titleKey: 'v2.features.local.title',
    descKey: 'v2.features.local.desc',
    glow: 'from-glow-blue/40',
    icon: 'local',
  },
  {
    titleKey: 'v2.features.byok.title',
    descKey: 'v2.features.byok.desc',
    glow: 'from-glow-orange/40',
    icon: 'byok',
  },
  {
    titleKey: 'v2.features.export.title',
    descKey: 'v2.features.export.desc',
    glow: 'from-glow-mint/40',
    icon: 'export',
  },
] as const;

export function FeaturesSection() {
  const { t } = useLocale();
  return (
    <section id="features" className="px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.25, 1] }}
        className="mx-auto mb-14 max-w-3xl text-center"
      >
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
          {t('v2.features.eyebrow')}
        </p>
        <h2 className="font-display text-balance text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[40px]">
          {t('v2.features.title')}
        </h2>
      </motion.div>

      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-4 md:grid-cols-2">
        {FEATURES.map((f, i) => (
          <motion.article
            key={f.titleKey}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{
              duration: 0.55,
              delay: i * 0.06,
              ease: [0.2, 0.8, 0.25, 1],
            }}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 transition hover:border-white/12 hover:bg-white/[0.04]"
          >
            <div
              className={`pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br ${f.glow} via-transparent to-transparent opacity-0 transition group-hover:opacity-100`}
              aria-hidden
            />
            <div className="relative">
              <FeatureIcon kind={f.icon} />
              <h3 className="mt-5 font-display text-[19px] font-semibold tracking-tight text-white">
                {t(f.titleKey)}
              </h3>
              <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-white/55">
                {t(f.descKey)}
              </p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function FeatureIcon({ kind }: { kind: 'spatial' | 'local' | 'byok' | 'export' }) {
  const common = 'h-10 w-10 rounded-xl flex items-center justify-center border';
  if (kind === 'spatial') {
    return (
      <div
        className={`${common} border-glow-violet/30 bg-glow-violet/[0.08] text-glow-violet`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="6" cy="6" r="2.4" fill="currentColor" />
          <circle cx="18" cy="9" r="2.4" fill="currentColor" />
          <circle cx="9" cy="18" r="2.4" fill="currentColor" />
          <path
            d="M7.5 7l9 1.5M7 8l3 8.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }
  if (kind === 'local') {
    return (
      <div className={`${common} border-glow-blue/30 bg-glow-blue/[0.08] text-glow-blue`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2.4"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="6.5" cy="7" r="0.8" fill="currentColor" />
          <circle cx="9" cy="7" r="0.8" fill="currentColor" />
        </svg>
      </div>
    );
  }
  if (kind === 'byok') {
    return (
      <div
        className={`${common} border-glow-orange/30 bg-glow-orange/[0.08] text-glow-orange`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="9" r="4.4" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12.2 12.2L20 20m-3-3l1.5 1.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className={`${common} border-glow-mint/30 bg-glow-mint/[0.08] text-glow-mint`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
