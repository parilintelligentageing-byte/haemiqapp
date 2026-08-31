// A single-beat ECG-style trace: flat line, a small P-wave bump, the
// sharp QRS spike (marked with a coral dot at the peak), a T-wave bump,
// then flat again. Pure SVG + CSS — no JavaScript, so it's safe to
// render as a plain server component.
//
// The draw-in animation uses the pathLength="1" trick: setting
// pathLength normalizes the path's total length to exactly 1 regardless
// of its real geometry, so stroke-dasharray/stroke-dashoffset can
// animate from 1 -> 0 without hand-computing the path's pixel length.
const ECG_PATH =
  "M0,50 L40,50 C55,50 55,38 70,38 C82,38 82,50 95,50 L200,50 L207,58 L217,10 L227,88 L237,50 L255,50 C270,50 270,36 285,36 C300,36 300,50 315,50 L600,50";

const PEAK = { x: 217, y: 10 };

export function PulseWaveform() {
  return (
    <svg
      viewBox="0 0 600 100"
      preserveAspectRatio="none"
      className="h-16 w-full sm:h-20"
      aria-hidden="true"
    >
      <path
        d={ECG_PATH}
        pathLength={1}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-teal animate-pulse-draw"
      />
      <circle
        cx={PEAK.x}
        cy={PEAK.y}
        r={5}
        className="fill-alert animate-marker"
      />
    </svg>
  );
}
