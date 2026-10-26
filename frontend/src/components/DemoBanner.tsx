import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';

// Under the header while in the shared demo account: what it is, and the way
// out to a real account (logs out of the demo first, so register isn't
// bounced back to the journal).
export default function DemoBanner() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user?.isDemo) return null;

  async function createAccount() {
    await logout();
    navigate('/register');
  }

  return (
    <div className="border-b border-accent/30 bg-accent/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <p className="text-slate-200">{t('demo.banner')}</p>
        <button type="button" className="font-semibold text-accent hover:underline" onClick={createAccount}>
          {t('demo.createAccount')}
        </button>
      </div>
    </div>
  );
}
