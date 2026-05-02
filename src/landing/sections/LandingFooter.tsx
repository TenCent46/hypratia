import { useLocale } from '../../web/LocaleProvider';
import { HypratiaIcon } from '../../web/HypratiaIcon';

const REPO_URL = 'https://github.com/TenCent46/hypratia';

export function LandingFooter() {
  const { t } = useLocale();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/[0.06] bg-ink-950/50 px-6 pb-12 pt-16 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-10 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2.5">
            <HypratiaIcon size={26} />
            <span className="font-display text-[15px] font-semibold tracking-tight text-white">
              Hypratia
            </span>
          </div>
          <p className="mt-3 max-w-[220px] text-[12.5px] leading-relaxed text-white/45">
            {t('v2.footer.tagline')}
          </p>
        </div>

        <FooterColumn
          title={t('v2.footer.section.product')}
          links={[
            { label: t('v2.footer.link.demo'), href: '/demo' },
            { label: t('header.download'), href: '#' },
            { label: t('v2.footer.link.changelog'), href: '#' },
          ]}
        />
        <FooterColumn
          title={t('v2.footer.section.resources')}
          links={[
            { label: 'GitHub', href: REPO_URL, external: true },
            { label: t('v2.footer.link.docs'), href: '#' },
          ]}
        />
        <FooterColumn
          title={t('v2.footer.section.legal')}
          links={[
            { label: t('v2.footer.link.privacy'), href: '#' },
            { label: t('v2.footer.link.license'), href: '#' },
          ]}
        />
      </div>

      <div className="mx-auto mt-12 max-w-[1100px] border-t border-white/[0.05] pt-6 text-[12px] text-white/35">
        © {year} Hypratia. macOS · Apple Silicon &amp; Intel.
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
        {title}
      </p>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target={l.external ? '_blank' : undefined}
              rel={l.external ? 'noreferrer' : undefined}
              className="text-[13px] text-white/65 transition hover:text-white"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
