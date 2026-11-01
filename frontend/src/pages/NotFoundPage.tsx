import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../hooks/usePageTitle.js';

// Any address no route matches - instead of an empty screen under the navbar.
// Behind ProtectedRoute like the other pages: logged out, it goes to login.
export default function NotFoundPage() {
  const { t } = useTranslation();
  usePageTitle(t('notFound.title'));
  return (
    <div className="space-y-3">
      <h1 className="text-3xl text-slate-100">{t('notFound.title')}</h1>
      <p className="text-slate-300">{t('notFound.text')}</p>
      <Link to="/" className="btn-primary inline-block">
        {t('notFound.toJournal')}
      </Link>
    </div>
  );
}
