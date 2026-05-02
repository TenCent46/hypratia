import { useLocale } from './LocaleProvider';
import { LOCALES, LOCALE_LABELS, type Locale } from './i18n';

const SHORT_LABELS: Record<Locale, string> = {
  en: 'EN',
  ja: 'JA',
  zh: 'ZH',
};

export function LanguageSwitcher() {
  const { locale, setLocale, t, tf } = useLocale();
  return (
    <div
      className="demo-lang-switch"
      role="group"
      aria-label={t('lang.aria.switcher')}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={`demo-lang-switch-btn${l === locale ? ' active' : ''}`}
          onClick={() => setLocale(l)}
          aria-pressed={l === locale}
          aria-label={tf('lang.aria.option', { label: LOCALE_LABELS[l] })}
          title={LOCALE_LABELS[l]}
        >
          {SHORT_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
