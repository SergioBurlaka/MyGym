import { useTranslation } from 'react-i18next';
import { AuthApi } from '../shared/api/auth/auth.api.js';
import { useAuthProvidersQuery } from '../shared/api/auth/index.js';

// "Continue with Google" + an "or" divider above the email form. Hidden
// until the backend says Google is configured, so a server without OAuth
// credentials never shows a button that would 404.
export default function GoogleSignInButton() {
  const { t } = useTranslation();
  const { data } = useAuthProvidersQuery();
  if (!data?.google) return null;

  return (
    <>
      {/* A real navigation, not fetch: the browser goes to Google and the
          backend callback brings it back to / with the session cookie set. */}
      <a href={AuthApi.googleSignInUrl()} className="btn-secondary flex w-full items-center justify-center gap-3">
        <GoogleLogo />
        {t('auth.google.continue')}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs uppercase text-slate-500">
        <span className="h-px flex-1 bg-surface-border" />
        {t('auth.google.or')}
        <span className="h-px flex-1 bg-surface-border" />
      </div>
    </>
  );
}

// Google's multicolour "G" (brand guidelines require it unmodified).
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
