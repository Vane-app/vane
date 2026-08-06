"use client";

import { useState } from "react";

/**
 * A business's mark.
 *
 * Businesses upload a logo at signup and it appeared nowhere — every card, dashboard
 * row and profile showed a coloured letter instead, which reads as a placeholder
 * rather than a marketplace.
 *
 * The initial stays as the fallback, because a logo can be absent (seeded campaigns
 * have none) or broken (a data URL that failed to decode). Falling back on error
 * matters more than it sounds: a broken image icon on every card would look worse
 * than the letter it replaced.
 */
export function Logo({
  src,
  initial,
  colour,
  size = 34,
  radius,
}: {
  src?: string | null;
  initial: string;
  colour: string;
  size?: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className="bizlogo"
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.32),
        background: showImage ? "transparent" : colour,
        fontSize: Math.max(11, Math.round(size * 0.38)),
      }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={src as string}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ borderRadius: radius ?? Math.round(size * 0.32) }}
        />
      ) : (
        initial
      )}
    </span>
  );
}
