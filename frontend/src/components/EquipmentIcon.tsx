import { useId } from 'react';
import type { Equipment } from '../types/index.js';

type Props = {
  equipment: Equipment;
  // Dumbbells moving in one rep: 2 draws two dumbbells (workout card).
  units?: 1 | 2;
  // Workout card style: solid plates, heads and head - no see-through
  // shapes. Off (Exercises page chip) - the outline icons.
  filled?: boolean;
  size?: number;
  className?: string;
};

// One set of equipment icons for the Exercises page and the workout card.
// Icons in currentColor. The workout card draws them filled: "2 dumbbells" is
// two tilted handles meeting at one end - two parallel ones read as a barbell -
// "1 dumbbell" is the same one lying flat (design canvas, «Іконка «2 гантелі»»,
// variant A, 2026-10-30). The Exercises page keeps the outline set.
export default function EquipmentIcon({ equipment, units = 1, filled = false, size = 14, className }: Props) {
  const maskId = `eq-db2-${useId().replace(/:/g, '')}`;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: ['shrink-0', className].filter(Boolean).join(' '),
  };

  if (filled && equipment === 'dumbbell' && units === 2) {
    // The front dumbbell is cut out of the back one with a mask, so the
    // overlap shows a gap instead of merged outlines.
    const front = (fill: string, handleWidth: number) => (
      <g transform="rotate(-19.09 11 16.75)">
        <path d="M4.12 16.75H17.88" strokeWidth={handleWidth} />
        <rect x="2.02" y="13.25" width="4.2" height="7" rx="1.4" fill={fill} />
        <rect x="15.78" y="13.25" width="4.2" height="7" rx="1.4" fill={fill} />
      </g>
    );
    return (
      <svg {...common}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="#fff" />
            <g stroke="#000" strokeWidth="4.4">{front('#000', 6.8)}</g>
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          <g transform="rotate(17.82 11.5 7.25)">
            <path d="M4.15 7.25H18.85" strokeWidth="2.4" />
            <rect x="2.05" y="3.75" width="4.2" height="7" rx="1.4" fill="currentColor" />
            <rect x="16.75" y="3.75" width="4.2" height="7" rx="1.4" fill="currentColor" />
          </g>
        </g>
        {front('currentColor', 2.4)}
      </svg>
    );
  }
  if (filled && equipment === 'dumbbell') {
    // Same style as the pair, lying flat.
    return (
      <svg {...common}>
        <path d="M5 12H19" strokeWidth="2.4" />
        <rect x="2.9" y="8.5" width="4.2" height="7" rx="1.4" fill="currentColor" />
        <rect x="16.9" y="8.5" width="4.2" height="7" rx="1.4" fill="currentColor" />
      </svg>
    );
  }
  if (equipment === 'dumbbell') {
    return (
      <svg {...common} strokeWidth="2">
        <path d="M8 12h8" />
        <rect x="3" y="8" width="5" height="8" rx="1.5" />
        <rect x="16" y="8" width="5" height="8" rx="1.5" />
      </svg>
    );
  }
  if (equipment === 'bodyweight') {
    return (
      <svg {...common} strokeWidth="2">
        <circle cx="12" cy="4.5" r="2" fill={filled ? 'currentColor' : 'none'} />
        <path d="M12 7v7M8 10h8M12 14l-3 7M12 14l3 7" />
      </svg>
    );
  }
  return (
    <svg {...common} strokeWidth="2">
      <path d="M2 12h20" />
      <rect x="5" y="7" width="3" height="10" rx="1" fill={filled ? 'currentColor' : 'none'} />
      <rect x="16" y="7" width="3" height="10" rx="1" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}
