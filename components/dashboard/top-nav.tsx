import Link from "next/link";

export function TopNav({
  name,
  showSuggestedTestsLink = false,
}: {
  name: string;
  showSuggestedTestsLink?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <nav className="flex flex-col gap-3 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-teal" />
          <span className="font-serif text-lg text-ink italic">haemiq</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-sans text-sm text-ink">{name}</span>
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal to-gold font-sans text-sm font-semibold text-paper"
          >
            {initial}
          </div>
        </div>
      </div>

      {showSuggestedTestsLink && (
        <div className="flex justify-end">
          <Link
            href="/suggested-tests"
            className="group flex items-center gap-1.5 rounded-full border border-line bg-surface px-[18px] py-2.5 font-serif text-sm text-ink italic transition-colors hover:border-teal hover:bg-white/[0.03]"
          >
            Suggested Tests
            <span
              aria-hidden="true"
              className="text-gold transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>
      )}
    </nav>
  );
}
