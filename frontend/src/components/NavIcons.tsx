import type { ReactNode } from 'react';

// Line icons of the phone navigation (design export
// docs/tasks/design/NavMobileA.dc.html) - 24-unit grid, drawn in currentColor.

function Icon({ size, strokeWidth, children }: { size: number; strokeWidth: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

// Bottom bar: 26 px, stroke 1.7.

export function JournalIcon({ size = 26 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.7}>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M3.5 7.5H6M3.5 11H6M3.5 14.5H6M3.5 18H6" />
      {/* The pencil hides the page's edge under it: filled with the bar's
          background (surface). */}
      <path d="M12 15.5l6.6-6.6a1.5 1.5 0 0 0-2.1-2.1L9.9 13.4v2.1z" fill="#14171c" />
    </Icon>
  );
}

export function ProgramsIcon({ size = 26 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.7}>
      <g transform="rotate(-45 12 12)">
        <path d="M8 12h8" />
        <rect x="5" y="7.5" width="3" height="9" rx="1" />
        <rect x="16" y="7.5" width="3" height="9" rx="1" />
        <rect x="2.5" y="9.5" width="2.5" height="5" rx="1" />
        <rect x="19" y="9.5" width="2.5" height="5" rx="1" />
      </g>
    </Icon>
  );
}

export function ProgressIcon({ size = 26 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.7}>
      <path d="M4 20h16" />
      <path d="M7 20v-4M11 20v-6M15 20v-5M19 20v-8" />
      <path d="M4 13l5-4 3 2 8-7" />
      <path d="M16.5 4H20v3.5" />
    </Icon>
  );
}

export function ExercisesIcon({ size = 26 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.7}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.6} />
    </Icon>
  );
}

export function MoreIcon({ size = 26 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.7}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Icon>
  );
}

// Sheet rows and the account menu: 18-22 px, stroke 1.8.

export function ScheduleIcon({ size = 22 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </Icon>
  );
}

export function ImportIcon({ size = 22 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Icon>
  );
}

export function IntegrationsIcon({ size = 22 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16.5V21" />
    </Icon>
  );
}

export function ChevronRightIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export function CloseIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function GlobeIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" />
    </Icon>
  );
}

export function LogoutIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </Icon>
  );
}
