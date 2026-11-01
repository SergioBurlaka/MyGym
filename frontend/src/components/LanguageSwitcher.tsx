import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/index.js';

// The language, not a country: "УКР", not "UA" (uk is the language code).
const LANGUAGE_LABEL: Record<SupportedLanguage, string> = {
  en: 'EN',
  uk: 'УКР',
};

// "large" - the phone account menu: 48×38 segments, thumb-sized.
export default function LanguageSwitcher({ size = 'small' }: { size?: 'small' | 'large' }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.language?.split('-')[0] as SupportedLanguage) ?? 'en';
  const large = size === 'large';

  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className={
        large
          ? 'flex items-center rounded-xl border border-surface-border bg-surface p-[3px]'
          : 'flex items-center gap-0.5 rounded-lg border border-surface-border p-0.5'
      }
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          aria-pressed={current === lng}
          onClick={() => i18n.changeLanguage(lng)}
          className={`font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            large ? 'h-[38px] min-w-12 rounded-[9px] px-2 text-[13px] font-bold' : 'rounded px-2 py-1 text-xs'
          } ${current === lng ? 'bg-accent text-surface' : large ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {LANGUAGE_LABEL[lng]}
        </button>
      ))}
    </div>
  );
}
