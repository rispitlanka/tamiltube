export default function Loading() {
  return (
    <div className="animate-pulse pt-8">
      <div className="flex items-center gap-4">
        <div className="h-[72px] w-[72px] rounded-full bg-paper-line" />
        <div className="space-y-2">
          <div className="h-7 w-64 rounded bg-paper-line" />
          <div className="h-4 w-40 rounded bg-paper-line" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-paper-line" />
        ))}
      </div>
      <div className="mt-8 h-64 rounded-2xl bg-paper-line" />
    </div>
  );
}
