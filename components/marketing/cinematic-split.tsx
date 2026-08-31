import type { ReactNode } from "react";
import { CinematicHero } from "@/components/marketing/cinematic-hero";

// Shared shell for /login, /signup, and the logged-out landing page:
// hero on the left (wider, 1.3fr), page-specific content on the right
// in a pre-styled, fade-in panel. Stacks vertically below the md
// breakpoint (768px) — hero first and shorter, then the panel.
export function CinematicSplit({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-[1.3fr_1fr]">
      <CinematicHero />
      <div className="flex min-h-[50vh] items-center justify-center bg-panel px-6 py-16 md:min-h-full">
        <div className="animate-step-in w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
