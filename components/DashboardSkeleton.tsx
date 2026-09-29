// v2.19.0 — route-level loading placeholder for /admin/* and /staff/*.
// Mirrors the dashboard page shape (white header block + black column bar +
// rows) so the swap to real content doesn't jump. DashboardNav stays mounted
// above it (it lives in the layout), so the user always keeps the nav.
export default function DashboardSkeleton() {
  return (
    <div className="dashboard-light min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <div className="skeleton h-2.5 w-24 mb-2" />
        <div className="skeleton h-8 md:h-9 w-48" />
        <div className="skeleton h-3 w-40 mt-2" />
      </div>
      <div className="hidden md:block bg-ink h-8" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 md:px-6 py-3 border-b border-neutral-200 bg-white"
        >
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
