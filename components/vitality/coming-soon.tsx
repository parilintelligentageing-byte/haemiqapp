interface ComingSoonCard {
  title: string;
  description: string;
}

const CARDS: ComingSoonCard[] = [
  {
    title: "Transformation timeline",
    description: "Available after your second blood report.",
  },
];

export function ComingSoon() {
  return (
    <div className="mt-16">
      <h2 className="text-center font-sans text-xs font-bold tracking-[0.32em] text-gold uppercase">
        — Coming soon —
      </h2>
      <div className="mx-auto mt-6 grid max-w-[1000px] grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        {CARDS.map((card) => (
          <div
            key={card.title}
            className="relative rounded-[20px] border border-dashed border-line bg-surface p-6"
          >
            <span className="absolute top-4 right-4 font-sans text-[9px] font-bold tracking-[0.14em] text-gold uppercase">
              Soon
            </span>
            <h3 className="font-serif text-lg text-ink italic">{card.title}</h3>
            <p className="mt-2 font-sans text-xs text-text-soft">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
