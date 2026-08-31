import type { Gender } from "@/lib/types/user-profile";

type SilhouetteVariant = "male" | "female" | "neutral";

function variantForGender(gender: Gender | null): SilhouetteVariant {
  if (gender === "male") return "male";
  if (gender === "female") return "female";
  return "neutral";
}

interface Proportions {
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  armHalfWidth: number;
  legHalfWidth: number;
}

// Male: broad shoulders tapering to a narrower waist and hip.
// Female: narrower shoulders, waist pinched in further, hips wider than
// shoulders (the classic hourglass curve).
// Neutral: shoulders a little narrower than male's, hip/waist difference
// gentler than female's — used for non-binary / prefer-not-to-say.
const PROPORTIONS: Record<SilhouetteVariant, Proportions> = {
  male: { shoulder: 52, chest: 44, waist: 36, hip: 40, armHalfWidth: 9, legHalfWidth: 17 },
  neutral: { shoulder: 46, chest: 40, waist: 32, hip: 38, armHalfWidth: 8, legHalfWidth: 16 },
  female: { shoulder: 40, chest: 36, waist: 28, hip: 46, armHalfWidth: 7, legHalfWidth: 15 },
};

// Shared vertical landmarks across all three variants, so a given score
// percentage fills to the same height regardless of silhouette shape.
const CX = 100;
const Y = {
  headTop: 12,
  headCy: 38,
  headR: 26,
  neckTop: 60,
  neckBottom: 78,
  shoulder: 84,
  chest: 140,
  waist: 195,
  hip: 250,
  armTop: 88,
  armBottom: 296,
  legTop: 250,
  feetBottom: 508,
};

// A tapered, rounded-cap "limb" shape — wider at one end than the other,
// unlike a uniform-width rounded rect. This is what turns tube-like arms
// and legs into something that actually reads as a limb.
function limbPath(cx: number, yTop: number, yBottom: number, topHalf: number, bottomHalf: number): string {
  const topCap = topHalf * 0.35;
  const bottomCap = bottomHalf * 0.35;
  return `
    M ${cx - topHalf},${yTop + topCap}
    C ${cx - topHalf},${yTop - topCap * 0.5} ${cx - topHalf * 0.4},${yTop - topCap} ${cx},${yTop - topCap}
    C ${cx + topHalf * 0.4},${yTop - topCap} ${cx + topHalf},${yTop - topCap * 0.5} ${cx + topHalf},${yTop + topCap}
    L ${cx + bottomHalf},${yBottom - bottomCap}
    C ${cx + bottomHalf},${yBottom + bottomCap * 0.5} ${cx + bottomHalf * 0.4},${yBottom + bottomCap} ${cx},${yBottom + bottomCap}
    C ${cx - bottomHalf * 0.4},${yBottom + bottomCap} ${cx - bottomHalf},${yBottom + bottomCap * 0.5} ${cx - bottomHalf},${yBottom - bottomCap}
    Z
  `;
}

// Torso outline: starts at neck width, flares out through the shoulder
// (rather than starting flat at full shoulder width), then curves through
// chest -> waist -> hip and mirrors back up the other side.
function torsoPath(p: Proportions): string {
  const { shoulder, chest, waist, hip } = p;
  return `
    M ${CX - 14},${Y.neckBottom}
    C ${CX - 14},${Y.neckBottom + 4} ${CX - shoulder + 6},${Y.shoulder - 10} ${CX - shoulder},${Y.shoulder}
    C ${CX - shoulder - 2},${Y.shoulder + 28} ${CX - chest - 2},${Y.shoulder + 48} ${CX - chest},${Y.chest}
    C ${CX - chest + 2},${Y.chest + 25} ${CX - waist - 2},${Y.chest + 40} ${CX - waist},${Y.waist}
    C ${CX - waist - 2},${Y.waist + 20} ${CX - hip},${Y.waist + 35} ${CX - hip},${Y.hip}
    L ${CX + hip},${Y.hip}
    C ${CX + hip},${Y.waist + 35} ${CX + waist + 2},${Y.waist + 20} ${CX + waist},${Y.waist}
    C ${CX + waist + 2},${Y.chest + 40} ${CX + chest - 2},${Y.chest + 25} ${CX + chest},${Y.chest}
    C ${CX + chest + 2},${Y.shoulder + 48} ${CX + shoulder + 2},${Y.shoulder + 28} ${CX + shoulder},${Y.shoulder}
    C ${CX + shoulder - 6},${Y.shoulder - 10} ${CX + 14},${Y.neckBottom + 4} ${CX + 14},${Y.neckBottom}
    Z
  `;
}

function BodyShapes({ p }: { p: Proportions }) {
  const legGap = 4;
  const leftArmCx = CX - p.shoulder - p.armHalfWidth * 0.6;
  const rightArmCx = CX + p.shoulder + p.armHalfWidth * 0.6;
  const leftLegCx = CX - (p.legHalfWidth + legGap / 2);
  const rightLegCx = CX + (p.legHalfWidth + legGap / 2);
  const ankleHalf = p.legHalfWidth * 0.55;

  return (
    <>
      <circle cx={CX} cy={Y.headCy} r={Y.headR} />
      <rect x={CX - 10} y={Y.neckTop} width={20} height={Y.neckBottom - Y.neckTop} rx={4} />
      <path d={torsoPath(p)} />

      {/* Arms — tapered from shoulder to wrist, not uniform tubes. */}
      <path d={limbPath(leftArmCx, Y.armTop, Y.armBottom, p.armHalfWidth, p.armHalfWidth * 0.6)} />
      <path d={limbPath(rightArmCx, Y.armTop, Y.armBottom, p.armHalfWidth, p.armHalfWidth * 0.6)} />

      {/* Legs — tapered from hip/thigh straight down to the ankle. */}
      <path d={limbPath(leftLegCx, Y.legTop, Y.feetBottom, p.legHalfWidth, ankleHalf)} />
      <path d={limbPath(rightLegCx, Y.legTop, Y.feetBottom, p.legHalfWidth, ankleHalf)} />
    </>
  );
}

export function BodySilhouette({
  gender,
  score,
}: {
  gender: Gender | null;
  score: number | null;
}) {
  const variant = variantForGender(gender);
  const p = PROPORTIONS[variant];
  const clipId = `body-clip-${variant}`;

  const top = Y.headTop;
  const bottom = Y.feetBottom;
  const totalHeight = bottom - top;
  const boundaryY = score === null ? bottom : top + totalHeight * (1 - score / 100);
  const fillHeight = bottom - boundaryY;

  return (
    <svg
      viewBox="0 0 200 520"
      className="h-full max-h-[420px] w-auto"
      role="img"
      aria-label="Body vitality silhouette"
    >
      <defs>
        <clipPath id={clipId}>
          <BodyShapes p={p} />
        </clipPath>
        <linearGradient id="vitality-fill-gradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--color-teal)" stopOpacity={0.85} />
          <stop offset="100%" stopColor="var(--color-teal)" stopOpacity={0.3} />
        </linearGradient>
      </defs>

      <g fill="none" stroke="rgba(245, 238, 219, 0.16)" strokeWidth={1.5} strokeLinejoin="round">
        <BodyShapes p={p} />
      </g>

      {score !== null && fillHeight > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <rect x={0} y={boundaryY} width={200} height={fillHeight} fill="url(#vitality-fill-gradient)" />
          <rect x={0} y={boundaryY - 2.5} width={200} height={5} fill="var(--color-teal)" fillOpacity={0.3} />
          <rect x={0} y={boundaryY - 1.5} width={200} height={3} fill="var(--color-teal)" fillOpacity={0.9} />
        </g>
      )}
    </svg>
  );
}
