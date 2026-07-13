export default function Loading() {
  return (
    <div className="page-enter">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-5 rounded-full bg-base" />
            <div className="h-5 w-24 rounded-md bg-base" />
          </div>
          <div className="h-7 w-44 rounded-lg mt-2 bg-base" />
          <div className="h-4 w-72 rounded-lg mt-2.5 bg-faint border border-light" />

          <div className="mt-8 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-faint border border-light h-[80px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
