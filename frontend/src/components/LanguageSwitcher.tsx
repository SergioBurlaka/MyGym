import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/index.js';

// The language, not a country: "УКР", not "UA" (uk is the language code).
const LANGUAGE_LABEL: Record<SupportedLanguage, string> = {
  en: 'EN',
  uk: 'УКР',
};

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = (i18n.language?.split('-')[0] as SupportedLanguage) ?? 'en';

  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex items-center gap-0.5 rounded-lg border border-surface-border p-0.5"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          aria-pressed={current === lng}
          onClick={() => i18n.changeLanguage(lng)}
          className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
            current === lng ? 'bg-accent text-surface' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {LANGUAGE_LABEL[lng]}
        </button>
      ))}
    </div>
  );
}
