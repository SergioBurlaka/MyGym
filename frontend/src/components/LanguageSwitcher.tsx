import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/index.js';

const LANGUAGE_LABEL: Record<SupportedLanguage, string> = {
  en: 'EN',
  uk: 'UA',
};

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language?.split('-')[0] as SupportedLanguage) ?? 'en';

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-surface-border p-0.5">
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => i18n.changeLanguage(lng)}
          className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
            current === lng ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {LANGUAGE_LABEL[lng]}
        </button>
      ))}
    </div>
  );
}
