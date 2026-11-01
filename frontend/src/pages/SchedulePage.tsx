import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { isAxiosError } from 'axios';
import { useSettingsQuery, useUpdateSettingsMutation } from '../shared/api/settings/index.js';
import type { UpdateSettingsInput } from '../shared/api/settings/settings.types.js';
import Select from '../components/Select.js';
import CalendarSubscription from '../components/CalendarSubscription.js';
import { translateApiError } from '../utils/apiError.js';
import { useAuth } from '../context/AuthContext.js';

// Training days, time and calendar reminders - moved off the bottom of the
// Exercises page (UX audit 2026-10-25, finding 08): the schedule decides the
// red "Missed" days in the journal calendar, which links here.
const WEEKDAYS: { day: number; key: string }[] = [
  { day: 1, key: 'mon' },
  { day: 2, key: 'tue' },
  { day: 3, key: 'wed' },
  { day: 4, key: 'thu' },
  { day: 5, key: 'fri' },
  { day: 6, key: 'sat' },
  { day: 7, key: 'sun' },
];

const DURATIONS = [30, 45, 60, 75, 90, 120];

export default function SchedulePage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.schedule'));
  const { user } = useAuth();
  const settingsQuery = useSettingsQuery();
  const updateMutation = useUpdateSettingsMutation();
  const settings = settingsQuery.data;
  const trainingDays = settings?.trainingDays ?? [];
  // Local copy: <input type="time"> fires on every keystroke, the value is
  // saved on blur.
  const [time, setTime] = useState(settings?.trainingTime ?? '');
  useEffect(() => {
    if (settings) setTime(settings.trainingTime);
  }, [settings?.trainingTime]);
  // Calendar apps poll the feed on their own schedule (Google - up to a day),
  // so after a change the subscribed calendar keeps the old times for a
  // while; say so instead of letting it look broken.
  const [calendarLagging, setCalendarLagging] = useState(false);

  async function save(input: UpdateSettingsInput) {
    await saveSettings(input);
    if (settings?.calendarConnectedAt && Object.keys(input).length > 0) setCalendarLagging(true);
  }

  // The timezone isn't a field in the form: every save carries the browser's
  // zone along if it differs, so calendar events land at the local time.
  async function saveSettings(input: UpdateSettingsInput) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone || timezone === settings?.timezone) {
      if (Object.keys(input).length > 0) await updateMutation.mutateAsync(input);
      return;
    }
    try {
      await updateMutation.mutateAsync({ ...input, timezone });
    } catch (err) {
      // A browser with newer tz data than the server can report a zone the
      // server rejects - that must not block saving the schedule itself.
      if (Object.keys(input).length === 0 || !isAxiosError(err) || err.response?.status !== 400) throw err;
      await updateMutation.mutateAsync(input);
    }
  }

  function toggleDay(day: number) {
    const next = trainingDays.includes(day)
      ? trainingDays.filter((d) => d !== day)
      : [...trainingDays, day];
    save({ trainingDays: next }).catch(() => {});
  }

  function saveTime() {
    if (!/^\d{2}:\d{2}$/.test(time) || time === settings?.trainingTime) return;
    // On failure put the saved value back, so the field never looks saved
    // when it isn't.
    save({ trainingTime: time }).catch(() => setTime(settings?.trainingTime ?? ''));
  }

  async function syncTimezone() {
    await save({}).catch(() => {});
  }

  if (settingsQuery.isPending) return <p className="text-slate-400">{t('common.loading')}</p>;
  // Without the saved settings the form would show no days picked, and one
  // tap would overwrite the real schedule - so don't show it at all.
  if (!settings) return <p className="text-red-400">{t('schedule.loadError')}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-slate-100">{t('schedule.title')}</h1>
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="4" width="16" height="17" rx="2" />
              <path d="M4 9h16M9 2v4M15 2v4" />
            </svg>
            {t('exercises.schedule.title')}
          </h2>
          <span className="text-[13px] text-slate-400">
            {t('exercises.schedule.daysPerWeek', { count: trainingDays.length })}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:max-w-md">
          {WEEKDAYS.map(({ day, key }) => {
            const active = trainingDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDay(day)}
                disabled={updateMutation.isPending}
                className={`h-11 rounded-lg border text-sm transition-colors ${
                  active
                    ? 'border-accent bg-accent/15 font-bold text-accent'
                    : 'border-surface-border bg-surface-border font-semibold text-slate-400 hover:border-slate-600'
                }`}
              >
                {t(`weekdays.${key}`)}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label className="label" htmlFor="training-time">{t('exercises.schedule.time')}</label>
            <input
              id="training-time"
              type="time"
              className="input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onBlur={saveTime}
              disabled={updateMutation.isPending}
            />
          </div>
          <div>
            <p className="label">{t('exercises.schedule.duration')}</p>
            <Select
              value={String(settings?.trainingDurationMin ?? 60)}
              onChange={(v) => save({ trainingDurationMin: Number(v) }).catch(() => {})}
              options={DURATIONS.map((m) => ({ value: String(m), label: t('exercises.schedule.minutes', { count: m }) }))}
              disabled={updateMutation.isPending}
            />
          </div>
        </div>
        {updateMutation.isError && (
          <p className="text-sm text-red-400">{translateApiError(updateMutation.error, t, 'exercises.schedule.saveError')}</p>
        )}
        {calendarLagging && settings?.calendarConnectedAt && (
          <p role="status" className="text-[13px] text-warn">{t('exercises.calendar.updateDelay')}</p>
        )}
        {/* A secret feed link isn't for the shared demo account (the API refuses it). */}
        {!user?.isDemo && (
          <CalendarSubscription connectedAt={settings?.calendarConnectedAt ?? null} beforeConnect={syncTimezone} />
        )}
        <div className="flex items-start gap-2 border-t border-surface-border pt-2.5 text-[13px] text-slate-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-px shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7.5v.5" />
          </svg>
          <span>{t('exercises.schedule.description')}</span>
        </div>
      </section>
    </div>
  );
}
