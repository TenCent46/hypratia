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
  /**
   * Caller-provided initial locale. Both `src/landing/main.tsx` and
   * `src/demo/main.tsx` set this before render via `detectLocale()` so the
   * first paint is already in the user's language. If omitted, we detect
   * synchronously here so the first render still matches.
   */
  initialLocale?: Locale;
};

export function LocaleProvider({ children, initialLocale }: ProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? detectLocale(),
  );

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
