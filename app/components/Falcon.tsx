"use client";

/**
 * The falcon.
 *
 * Not a logo bolted onto a screen — a character with a small behaviour vocabulary.
 * Big where we are telling the story, small where people are working. Every mode
 * respects prefers-reduced-motion by falling back to a still, composed pose.
 */

export type FalconMode = "fly" | "idle" | "thinking" | "swoop";

/* A peregrine seen from below: broad shoulders tapering to pointed tips, a
   concave trailing edge, a compact body and a short fanned tail. Three parts so
   the wings can be rigged and beat from the shoulder. */
const WING_L =
  "M115 44 C 95 46, 66 54, 34 72 C 24 78, 14 85, 6 92 C 18 90, 30 86, 44 81 C 68 72, 96 62, 115 57 Z";
const WING_R =
  "M125 44 C 145 46, 174 54, 206 72 C 216 78, 226 85, 234 92 C 222 90, 210 86, 196 81 C 172 72, 144 62, 125 57 Z";
const BODY =
  "M120 26 C 115 26, 112 30, 112 37 C 111 47, 112 57, 113 65 L 111 82 L 115 94 L 120 102 L 125 94 L 129 82 L 127 65 C 128 57, 129 47, 128 37 C 128 30, 125 26, 120 26 Z";

export function Falcon({
  mode = "idle",
  size = 120,
  color = "var(--amber)",
}: {
  mode?: FalconMode;
  size?: number;
  color?: string;
}) {
  return (
    <>
      <svg
        className={`falcon falcon-${mode}`}
        viewBox="0 0 240 120"
        width={size}
        height={(size * 120) / 240}
        aria-hidden="true"
        focusable="false"
      >
        <path className="wing wing-l" d={WING_L} fill={color} />
        <path className="wing wing-r" d={WING_R} fill={color} />
        <path d={BODY} fill={color} />
      </svg>

      <style jsx>{`
        .falcon {
          overflow: visible;
          filter: drop-shadow(0 10px 26px rgba(217, 142, 43, 0.32));
        }
        .wing {
          transform-box: fill-box;
        }
        .wing-l {
          transform-origin: 100% 0%;
        }
        .wing-r {
          transform-origin: 0% 0%;
        }

        /* fly — full wingbeat, used on hero moments */
        .falcon-fly .wing-l {
          animation: flapL 0.95s ease-in-out infinite alternate;
        }
        .falcon-fly .wing-r {
          animation: flapR 0.95s ease-in-out infinite alternate;
        }

        /* idle — perched, breathing. Present, never nagging. */
        .falcon-idle {
          animation: breathe 4.5s ease-in-out infinite;
        }
        .falcon-idle .wing-l {
          animation: settleL 6s ease-in-out infinite;
        }
        .falcon-idle .wing-r {
          animation: settleR 6s ease-in-out infinite;
        }

        /* thinking — a slow head tilt while it verifies. The wait is the animation. */
        .falcon-thinking {
          animation: tilt 2.2s ease-in-out infinite;
        }
        .falcon-thinking .wing-l {
          animation: flapL 2.4s ease-in-out infinite alternate;
        }
        .falcon-thinking .wing-r {
          animation: flapR 2.4s ease-in-out infinite alternate;
        }

        /* swoop — the signature. Money lands in its wake. */
        .falcon-swoop {
          animation: swoop 2.4s var(--ease) both;
        }
        .falcon-swoop .wing-l {
          animation: flapL 0.42s ease-in-out 5 alternate;
        }
        .falcon-swoop .wing-r {
          animation: flapR 0.42s ease-in-out 5 alternate;
        }

        @keyframes flapL {
          from {
            transform: rotate(-16deg);
          }
          to {
            transform: rotate(20deg);
          }
        }
        @keyframes flapR {
          from {
            transform: rotate(16deg);
          }
          to {
            transform: rotate(-20deg);
          }
        }
        @keyframes settleL {
          0%, 88%, 100% {
            transform: rotate(0deg);
          }
          93% {
            transform: rotate(-7deg);
          }
        }
        @keyframes settleR {
          0%, 88%, 100% {
            transform: rotate(0deg);
          }
          93% {
            transform: rotate(7deg);
          }
        }
        @keyframes breathe {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-4px) scale(1.015);
          }
        }
        @keyframes tilt {
          0%, 100% {
            transform: rotate(-4deg);
          }
          50% {
            transform: rotate(5deg);
          }
        }
        @keyframes swoop {
          0% {
            transform: translate(-120%, 40%) rotate(-18deg) scale(0.7);
            opacity: 0;
          }
          22% {
            opacity: 1;
          }
          55% {
            transform: translate(0, -10%) rotate(2deg) scale(1.08);
            opacity: 1;
          }
          100% {
            transform: translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .falcon,
          .wing {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  );
}

/** The V mark — peregrine mid-dive. App icon, nav, favicon. */
export function Mark({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        fill={color}
        d="M24 46 L6 7 C13 14.5 18.5 17 24 16 C29.5 17 35 14.5 42 7 Z M24 38 L15.5 19 C18.5 21.3 21.2 22.2 24 21.8 C26.8 22.2 29.5 21.3 32.5 19 Z"
      />
    </svg>
  );
}
