import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/index.js';
import Popconfirm from './Popconfirm.js';
import CopyField from './CopyField.js';
import { useCreateCalendarTokenMutation, useDeleteCalendarTokenMutation } from '../shared/api/calendar/index.js';
import type { CalendarFeedLang } from '../shared/api/calendar/calendar.types.js';
import { translateApiError } from '../utils/apiError.js';

function formatConnectedAt(iso: string) {
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

// Subscription to the ICS feed of the training schedule. The feed URL holds
// a secret token, so like a personal access token it is shown only right
// after it's created; later the user can only regenerate or disconnect it.
export default function CalendarSubscription({
  connectedAt,
  beforeConnect,
}: {
  connectedAt: string | null;
  // Lets the schedule card sync the browser's timezone first, so the very
  // first fetch of the feed already places events at the right local time.
  beforeConnect: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const createMutation = useCreateCalendarTokenMutation();
  const deleteMutation = useDeleteCalendarTokenMutation();
  // Covers the beforeConnect() await too: createMutation isn't pending yet
  // then, and a second click would mint a second token - the first response
  // shown would be a link already replaced in the database.
  const [connecting, setConnecting] = useState(false);
  const links = createMutation.data;
  const busy = connecting || createMutation.isPending || deleteMutation.isPending;

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    try {
      await beforeConnect();
      const lang: CalendarFeedLang = i18n.language?.startsWith('uk') ? 'uk' : 'en';
      await createMutation.mutateAsync(lang).catch(() => {});
    } finally {
      setConnecting(false);
    }
  }

  const error = createMutation.error ?? deleteMutation.error;

  return (
    <div className="space-y-3 border-t border-surface-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-100">{t('exercises.calendar.title')}</p>
          <p className="text-[13px] text-slate-400">
            {connectedAt
              ? t('exercises.calendar.connectedAt', { date: formatConnectedAt(connectedAt) })
              : t('exercises.calendar.description')}
          </p>
        </div>

        {!connectedAt && (
          <button type="button" className="btn-primary" onClick={connect} disabled={busy}>
            {t('exercises.calendar.connect')}
          </button>
        )}

        {connectedAt && !links && (
          <div className="flex gap-2">
            <Popconfirm
              title={t('exercises.calendar.regenerateConfirmTitle')}
              description={t('exercises.calendar.regenerateConfirmDescription')}
              confirmText={t('exercises.calendar.regenerate')}
              onConfirm={connect}
            >
              <button type="button" className="btn-secondary" disabled={busy}>
                {t('exercises.calendar.regenerate')}
              </button>
            </Popconfirm>
            <Popconfirm
              title={t('exercises.calendar.disconnectConfirmTitle')}
              description={t('exercises.calendar.disconnectConfirmDescription')}
              confirmText={t('exercises.calendar.disconnect')}
              onConfirm={() => deleteMutation.mutate()}
            >
              <button type="button" className="btn-ghost text-red-400" disabled={busy}>
                {t('exercises.calendar.disconnect')}
              </button>
            </Popconfirm>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{translateApiError(error, t, 'exercises.calendar.error')}</p>}

      {links && (
        <div className="space-y-3 rounded-lg border border-accent p-3">
          <p className="text-sm text-warn">{t('exercises.calendar.shownOnce')}</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary" href={links.webcalUrl}>
              {t('exercises.calendar.openInCalendar')}
            </a>
            <a className="btn-secondary" href={links.googleUrl} target="_blank" rel="noopener noreferrer">
              {t('exercises.calendar.addToGoogle')}
            </a>
          </div>
          <CopyField label={t('exercises.calendar.linkLabel')} value={links.feedUrl} />
          <button type="button" className="btn-secondary" onClick={() => createMutation.reset()}>
            {t('exercises.calendar.done')}
          </button>
        </div>
      )}

      <p className="text-[13px] text-slate-400">{t('exercises.calendar.hint')}</p>
    </div>
  );
}
