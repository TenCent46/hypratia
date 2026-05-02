import { motion } from 'framer-motion';
import { useLocale } from '../../web/LocaleProvider';

const TIERS = [
  {
    titleKey: 'v2.pricing.community.title',
    taglineKey: 'v2.pricing.community.tagline',
    ctaKey: 'v2.pricing.community.cta',
    bullets: [
      'v2.pricing.community.bullet1',
      'v2.pricing.community.bullet2',
      'v2.pricing.community.bullet3',
    ],
    popular: false,
  },
  {
    titleKey: 'v2.pricing.founder.title',
    taglineKey: 'v2.pricing.founder.tagline',
    ctaKey: 'v2.pricing.founder.cta',
    bullets: [
      'v2.pricing.founder.bullet1',
      'v2.pricing.founder.bullet2',
      'v2.pricing.founder.bullet3',
    ],
    popular: true,
  },
  {
    titleKey: 'v2.pricing.pro.title',
    taglineKey: 'v2.pricing.pro.tagline',
    ctaKey: 'v2.pricing.pro.cta',
    bullets: [
      'v2.pricing.pro.bullet1',
      'v2.pricing.pro.bullet2',
      'v2.pricing.pro.bullet3',
    ],
    popular: false,
  },
] as const;

export function PricingSection() {
  const { t } = useLocale();
  return (
    <section id="pricing" className="px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.25, 1] }}
        className="mx-auto mb-12 max-w-3xl text-center"
      >
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
          {t('v2.pricing.eyebrow')}
        </p>
        <h2 className="font-display text-[28px] font-semibold tracking-tight text-white sm:text-[40px]">
          {t('v2.pricing.title')}
        </h2>
      </motion.div>

      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((tier, i) => (
          <motion.article
            key={tier.titleKey}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{
              duration: 0.55,
              delay: i * 0.07,
              ease: [0.2, 0.8, 0.25, 1],
            }}
            className={`relative rounded-2xl p-7 ${
              tier.popular
                ? 'border border-glow-violet/30 bg-gradient-to-b from-glow-violet/[0.08] to-white/[0.01] ring-1 ring-glow-violet/20'
                : 'border border-white/[0.06] bg-white/[0.02]'
            }`}
          >
            {tier.popular ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-glow-violet/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-950">
                {t('v2.pricing.popular')}
              </span>
            ) : null}
            <h3 className="font-display text-[20px] font-semibold tracking-tight text-white">
              {t(tier.titleKey)}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
              {t(tier.taglineKey)}
            </p>
            <ul className="mt-6 space-y-2.5">
              {tier.bullets.map((bk) => (
                <li
                  key={bk}
                  className="flex items-start gap-2 text-[13px] text-white/75"
                >
                  <CheckGlyph
                    className={
                      tier.popular ? 'text-glow-violet' : 'text-white/35'
                    }
                  />
                  {t(bk)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`mt-7 w-full rounded-xl py-2.5 text-[13.5px] font-semibold transition ${
                tier.popular
                  ? 'bg-white text-ink-950 hover:bg-white/95'
                  : 'border border-white/12 bg-white/[0.03] text-white/85 hover:border-white/20 hover:bg-white/[0.06]'
              }`}
            >
              {t(tier.ctaKey)}
            </button>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className={`mt-0.5 flex-shrink-0 ${className ?? ''}`}
      aria-hidden
    >
      <path
        d="M4 12.5l5 5 11-12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
