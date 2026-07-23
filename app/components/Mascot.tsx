import Image from "next/image";

/**
 * The falcon — the agent, rendered.
 *
 * Four states, each shown at the moment the agent is doing that thing:
 *   watching  — present and overseeing (home, dashboards, onboarding)
 *   thinking  — verifying a claimed result
 *   approving — the payout swoop, money landing
 *   refusing  — a held / refused result
 *
 * The images carry their own dark ground and amber glow, so they drop straight
 * onto the app's near-black surfaces.
 */

export type FalconState = "watching" | "thinking" | "approving" | "refusing";

const DIMS: Record<FalconState, { w: number; h: number }> = {
  watching: { w: 1024, h: 1536 },
  thinking: { w: 492, h: 862 },
  approving: { w: 492, h: 862 },
  refusing: { w: 492, h: 862 },
};

export function Mascot({
  state = "watching",
  size = 220,
  className,
  priority,
}: {
  state?: FalconState;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const d = DIMS[state];
  return (
    <Image
      src={`/mascot/${state}.png`}
      alt=""
      width={d.w}
      height={d.h}
      priority={priority}
      className={`mascot ${className ?? ""}`}
      style={{ width: size, height: "auto" }}
    />
  );
}
