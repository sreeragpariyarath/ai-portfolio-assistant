import type { FunArt } from "@/features/cards/portfolio-cards";

// Small animated illustrations for the Fun card, drawn for this site (no emoji, no outside artwork). They sit
// on a colour gradient, so they use white with soft fills. The motion lives in globals.css (`fun-art-*`) and
// stops for visitors who ask for reduced motion. Decorative: hidden from screen readers.

const W = "#ffffff";

// A disc with a wavy edge: `bumps` round bumps around a circle of radius r.
function scallop(cx: number, cy: number, r: number, bumps: number): string {
  const points: string[] = [];
  for (let i = 0; i <= 180; i++) {
    const angle = (i / 180) * Math.PI * 2;
    const radius = r + 1.6 * Math.cos(angle * bumps);
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join(" L")} Z`;
}

// An even spiral from the centre outwards: `turns` turns, ending at radius `r`.
function spiral(cx: number, cy: number, r: number, turns: number): string {
  const points: string[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    points.push(`${(cx + r * t * Math.cos(angle)).toFixed(2)} ${(cy + r * t * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join(" L")}`;
}

function Anime() {
  return (
    <>
      {/* A shuriken behind, slowly turning. */}
      <g className="fun-art-spin-slow" style={{ transformOrigin: "66px 30px" }}>
        <path d="M66 14 L70 26 L82 30 L70 34 L66 46 L62 34 L50 30 L62 26 Z" fill={W} fillOpacity="0.35" />
        <circle cx="66" cy="30" r="3" fill={W} fillOpacity="0.6" />
      </g>
      {/* A narutomaki (fish cake) slice: a white disc with a scalloped edge and a pink spiral. */}
      <g className="fun-art-spin" style={{ transformOrigin: "40px 56px" }}>
        <path d={scallop(40, 56, 22, 18)} fill={W} />
        <path d={spiral(40, 56, 14.5, 2.6)} fill="none" stroke="#ec4899" strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <path className="fun-art-twinkle" d="M80 62 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" fill={W} />
    </>
  );
}

function Movies() {
  return (
    <>
      {/* A film reel turning behind the clapperboard. */}
      <g className="fun-art-spin" style={{ transformOrigin: "64px 32px" }}>
        <circle cx="64" cy="32" r="18" fill={W} fillOpacity="0.25" />
        {[0, 72, 144, 216, 288].map((angle) => (
          <circle key={angle} cx={64 + 10 * Math.cos((angle * Math.PI) / 180)} cy={32 + 10 * Math.sin((angle * Math.PI) / 180)} r="3.6" fill={W} fillOpacity="0.55" />
        ))}
        <circle cx="64" cy="32" r="2.6" fill={W} />
      </g>
      {/* The clapperboard: its top bar snaps open and shut. */}
      <rect x="18" y="46" width="48" height="32" rx="4" fill={W} />
      <rect x="18" y="46" width="48" height="8" fill="#c4b5fd" />
      <g className="fun-art-clap" style={{ transformOrigin: "18px 44px" }}>
        <rect x="18" y="36" width="48" height="8" rx="2" fill={W} />
        <path d="M24 36 l6 8 M36 36 l6 8 M48 36 l6 8 M60 36 l5 7" stroke="#7c3aed" strokeWidth="3.4" />
      </g>
      <path d="M28 64 h24 M28 70 h16" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Music() {
  return (
    <>
      {/* Notes floating up. */}
      <g className="fun-art-float">
        <path d="M70 34 v-14 l10 -3 v14" fill="none" stroke={W} strokeWidth="2.6" strokeLinejoin="round" />
        <ellipse cx="67" cy="35" rx="3.6" ry="2.8" fill={W} />
        <ellipse cx="77" cy="32" rx="3.6" ry="2.8" fill={W} />
      </g>
      <g className="fun-art-float-late">
        <path d="M84 52 v-12" stroke={W} strokeWidth="2.4" strokeOpacity="0.8" />
        <ellipse cx="81.5" cy="52.5" rx="3.2" ry="2.5" fill={W} fillOpacity="0.8" />
      </g>
      {/* A guitar, tilted, with strings that shiver. */}
      <g transform="rotate(-38 40 56)">
        <rect x="37" y="10" width="7" height="36" rx="2" fill={W} fillOpacity="0.9" />
        <rect x="35" y="6" width="11" height="9" rx="3" fill={W} />
        <path d="M40.5 40 c-12 0 -16 8 -14 15 c2 6 -2 9 -1 15 c2 10 13 14 15 14 s13 -4 15 -14 c1 -6 -3 -9 -1 -15 c2 -7 -2 -15 -14 -15z" fill={W} />
        <circle cx="40.5" cy="60" r="5" fill="#db2777" fillOpacity="0.85" />
        <g className="fun-art-strum">
          <path d="M39 14 V78 M42 14 V78" stroke="#a855f7" strokeWidth="0.9" />
        </g>
        <rect x="33" y="72" width="15" height="3" rx="1.5" fill="#a855f7" />
      </g>
    </>
  );
}

function Travel() {
  return (
    <>
      {/* A dashed route that keeps moving, ending at a map pin. */}
      <path className="fun-art-route" d="M10 74 C 28 40, 48 84, 70 46" fill="none" stroke={W} strokeOpacity="0.75" strokeWidth="2.4" strokeDasharray="5 6" strokeLinecap="round" />
      <g className="fun-art-bob">
        <path d="M76 18 c-8 0 -13 6 -13 12 c0 9 13 21 13 21 s13 -12 13 -21 c0 -6 -5 -12 -13 -12z" fill={W} />
        <circle cx="76" cy="30" r="4.6" fill="#0ea5e9" />
      </g>
      {/* A paper plane gliding. */}
      <g className="fun-art-glide">
        <path d="M14 46 L46 30 L34 56 L30 46 Z" fill={W} />
        <path d="M30 46 L46 30" stroke="#7dd3fc" strokeWidth="2" />
        <path d="M30 46 L32 54 L34 56" fill="#bae6fd" />
      </g>
    </>
  );
}

function Space() {
  return (
    <>
      {[
        [14, 18, 1.6],
        [84, 14, 1.3],
        [20, 76, 1.2],
        [88, 70, 1.7],
        [52, 10, 1.1],
      ].map(([x, y, r], index) => (
        <circle key={index} className="fun-art-twinkle" style={{ animationDelay: `${index * 0.45}s` }} cx={x} cy={y} r={r} fill={W} />
      ))}
      {/* A ringed planet with a small moon in orbit. */}
      <circle cx="48" cy="48" r="20" fill={W} fillOpacity="0.95" />
      <path d="M32 40 q16 -6 32 4 M30 50 q18 -4 36 6" stroke="#c4b5fd" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="48" cy="50" rx="36" ry="9" fill="none" stroke={W} strokeWidth="3" strokeOpacity="0.8" transform="rotate(-18 48 50)" />
      <g className="fun-art-orbit" style={{ transformOrigin: "48px 48px" }}>
        <circle cx="84" cy="34" r="5" fill="#fde68a" />
      </g>
    </>
  );
}

function Exploring() {
  return (
    <>
      <circle cx="48" cy="48" r="30" fill={W} />
      <circle cx="48" cy="48" r="24" fill="none" stroke="#86efac" strokeWidth="2" />
      {[0, 90, 180, 270].map((angle) => (
        <path key={angle} d="M48 22 v6" stroke="#16a34a" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${angle} 48 48)`} />
      ))}
      <text x="48" y="19.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#15803d">
        N
      </text>
      {/* The needle swings, looking for somewhere new. */}
      <g className="fun-art-needle" style={{ transformOrigin: "48px 48px" }}>
        <path d="M48 26 L54 48 L48 52 L42 48 Z" fill="#ef4444" />
        <path d="M48 70 L54 48 L48 44 L42 48 Z" fill="#94a3b8" />
      </g>
      <circle cx="48" cy="48" r="3" fill="#0f172a" />
    </>
  );
}

const ART: Record<FunArt, () => React.JSX.Element> = { anime: Anime, movies: Movies, music: Music, travel: Travel, space: Space, exploring: Exploring };

export function FunArtwork({ art, className = "" }: { art: FunArt; className?: string }) {
  const Drawing = ART[art];
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 96 96" className={`fun-art ${className}`}>
      <Drawing />
    </svg>
  );
}
