import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';

// Public (no login needed): Google's OAuth consent screen links here, and so
// would a store listing. Text lives in privacy.* in en/uk.json.
const SECTIONS = ['data', 'google', 'use', 'storage', 'sharing', 'deletion', 'contact'] as const;

// Shown verbatim on the page, the same address as Google's consent screen.
const CONTACT_EMAIL = 'burlaka01@gmail.com';

export default function PrivacyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    // Logged-out visitors have no Navbar, so the page clears the status bar itself.
    <article className={`mx-auto max-w-2xl space-y-6 ${user ? '' : 'pt-[env(safe-area-inset-top)]'}`}>
      <header>
        <h1 className="text-3xl text-accent">{t('privacy.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('privacy.updated', { date: '2026-10-21' })}</p>
      </header>
      <p className="text-slate-300">{t('privacy.intro')}</p>
      {SECTIONS.map((key) => (
        <section key={key} className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">{t(`privacy.${key}.title`)}</h2>
          <p className="whitespace-pre-line text-slate-300">{t(`privacy.${key}.body`, { email: CONTACT_EMAIL })}</p>
        </section>
      ))}
      <p>
        <Link to={user ? '/' : '/login'} className="text-accent hover:underline">
          {t('privacy.back')}
        </Link>
      </p>
    </article>
  );
}
