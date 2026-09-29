// v2.19.0 — route-level loading placeholder for /admin/* and /staff/*.
// v2.22.0 — reshaped for the light shell: the rail + top bar stay mounted
// (they live in the layout), so this only mirrors the page body:
// KPI-style tiles, the black column bar and a few rows.
export default function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 px-4 md:px-6 py-4 border-b border-line">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`bg-white border border-line px-4 py-3.5 h-[92px] ${i > 2 ? 'hidden xl:block' : ''}`}>
            <div className="skeleton h-2.5 w-20 mb-3" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="hidden md:block bg-ink h-9" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 md:px-6 py-3.5 border-b border-line bg-white">
          <div className="skeleton h-3.5 w-14" />
          <div className="skeleton h-3.5 flex-1 max-w-[260px]" />
          <div className="skeleton h-3.5 w-32 hidden md:block" />
          <div className="skeleton h-3.5 w-28 hidden md:block" />
          <div className="skeleton h-5 w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
}
