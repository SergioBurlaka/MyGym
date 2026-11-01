import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Under the header while the browser reports no network. The workout page
// keeps the edits and saves them by itself on `online` - this only says so,
// so a spinner in the gym's dead zone doesn't look like lost sets.
export default function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div role="status">
      {offline && (
        <div className="border-b border-warn/30 bg-warn/10">
          <p className="mx-auto max-w-5xl px-4 py-2 text-sm text-warn">{t('offline.banner')}</p>
        </div>
      )}
    </div>
  );
}
