import { PulseWaveform } from "@/components/marketing/pulse-waveform";

// The left panel shared by /login, /signup, and the logged-out landing
// page. Pure markup + CSS — no client state.
export function CinematicHero() {
  return (
    <div className="relative flex min-h-[50vh] flex-col justify-between overflow-hidden bg-paper px-8 py-10 sm:px-12 sm:py-14 md:min-h-full">
      {/* Subtle radial glow, top-right. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/4 -right-1/4 h-[60%] w-[60%] rounded-full bg-teal/[0.08] blur-3xl"
      />

      <div className="relative flex items-center gap-2">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-teal" />
        <span className="font-serif text-lg italic text-ink">haemiq</span>
      </div>

      <div className="relative">
        <h1 className="font-serif text-5xl leading-[1.1] italic text-ink sm:text-6xl">
          Read your body&apos;s
          <br />
          <span className="text-teal">signal.</span>
        </h1>
        <p className="mt-6 max-w-md font-serif text-lg italic text-text-soft">
          Blood-first health intelligence. Built by someone living the
          transformation.
        </p>
      </div>

      <div className="relative">
        <PulseWaveform />
      </div>
    </div>
  );
}
