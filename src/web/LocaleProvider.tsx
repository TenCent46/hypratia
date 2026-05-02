import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  detectLocale,
  format,
  persistLocale,
  translate,
  type Locale,
} from './i18n';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** Translate a key. */
  t: (key: string) => string;
  /** Translate + interpolate `{name}` placeholders. */
  tf: (key: string, vars: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  /** Caller-provided initial locale (set in main.tsx before render to avoid FOUC). */
  initialLocale?: Locale;
};

export function LocaleProvider({ children, initialLocale }: ProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? 'en');

  // If initialLocale wasn't supplied (e.g., tests), detect after mount.
  useEffect(() => {
    if (initialLocale) return;
    const detected = detectLocale();
    setLocaleState(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: string) => translate(locale, key),
      tf: (key: string, vars) => format(translate(locale, key), vars),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside a <LocaleProvider>');
  }
  return ctx;
}
