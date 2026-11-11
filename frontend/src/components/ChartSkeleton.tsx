// A chart's place while it loads or draws (DESIGN_PRINCIPLES: skeletons shaped
// like the content, no layout shift): the line chart's horizontal grid, its Y
// axis labels on the left and the date row at the bottom, pulsing. Decorative -
// whoever shows it while loading says so to a screen reader (ProgressPage).
// The height is the caller's: the chart's own, so nothing jumps when it comes.
export default function ChartSkeleton({ className = 'h-[220px]' }: { className?: string }) {
  return (
    <div aria-hidden className={`flex animate-pulse flex-col gap-2 motion-reduce:animate-none ${className}`}>
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex w-12 flex-col justify-between py-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2 w-8 self-end rounded bg-surface-border" />
          ))}
        </div>
        <div className="flex flex-1 flex-col justify-between py-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-px bg-surface-border" />
          ))}
        </div>
      </div>
      <div className="flex justify-between pl-14 pr-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-2 w-7 rounded bg-surface-border" />
        ))}
      </div>
    </div>
  );
}

// The weekly volume chart's place (WeeklyCategoryChart): the week title, its
// three tiles, the bars strip and the legend - as tall as the chart: 421px on a
// phone, 342px from sm (the tiles' text fits on fewer lines).
const BAR_HEIGHTS = [40, 65, 30, 80, 55, 70, 25, 60, 45];
export function WeeklyChartSkeleton() {
  return (
    <div aria-hidden className="flex h-[421px] animate-pulse sm:h-[342px] flex-col gap-3 motion-reduce:animate-none">
      <span className="h-5 w-44 rounded bg-surface-border" />
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-[97px] rounded-[10px] bg-surface" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-2 border-b border-surface-border">
        {BAR_HEIGHTS.map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-surface-border" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 w-20 rounded bg-surface-border" />
        ))}
      </div>
    </div>
  );
}
