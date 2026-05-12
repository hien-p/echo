"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Synex-style photoreal stone with hover-to-reveal mossy overlay.
 *
 * Two stacked images (base = dry stone, grass = same stone covered in
 * moss). On mouse enter, a radial CSS mask reveals the grass image
 * through a soft circle that follows the cursor; on leave, the circle
 * springs back to radius 0.
 *
 * Mounted twice in SynexHero (left + right corners of the admin
 * /forms/[id]/admin landing). Assets sourced from qclay.design's
 * hosted PNGs — for the Walrus Sessions hackathon submission we lean
 * on hosted public design assets rather than redistributing the
 * binaries in the repo.
 *
 * Port verbatim from the prompt spec; only adapted to our motion
 * import path and TS conventions.
 */
export function StoneReveal({
  side,
  zBase,
  zGrass,
  baseSrc,
  grassSrc,
}: {
  side: "left" | "right";
  zBase: number;
  zGrass: number;
  baseSrc: string;
  grassSrc: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const radiusRaw = useMotionValue(0);
  const radius = useSpring(radiusRaw, { stiffness: 200, damping: 25 });

  // useTransform feeds the mask string reactively. We can't read x/y
  // inside the style prop directly (Motion values aren't synchronous);
  // wrap in a transform that the motion.div picks up.
  const mask = useTransform(
    [x, y, radius],
    ([latestX, latestY, latestR]) =>
      `radial-gradient(circle ${latestR}px at ${latestX}px ${latestY}px, black 0%, black 40%, transparent 100%)`,
  );

  // Stones load late on slow connections — guard the entry animation
  // until first paint so the offset/blur don't fight a still-loading
  // <img>.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      ref={wrapperRef}
      className={`pointer-events-auto absolute bottom-0 ${
        side === "left" ? "left-0" : "right-0"
      } w-fit cursor-crosshair`}
      style={{
        height: "min(680px, max(280px, 50vh))",
      }}
      onMouseEnter={() => radiusRaw.set(120)}
      onMouseLeave={() => radiusRaw.set(0)}
      onMouseMove={(e) => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        x.set(e.clientX - rect.left);
        y.set(e.clientY - rect.top);
      }}
    >
      {/* Base stone — dry */}
      <motion.img
        src={baseSrc}
        alt=""
        aria-hidden="true"
        initial={{ opacity: 0, x: side === "left" ? -40 : 40 }}
        animate={mounted ? { opacity: 1, x: 0 } : { opacity: 0 }}
        transition={{ duration: 0.9, delay: 0.5, ease: "easeOut" }}
        className="block h-full w-auto"
        style={{
          objectFit: "contain",
          objectPosition: `${side} bottom`,
          zIndex: zBase,
        }}
      />

      {/* Grass overlay — revealed through the radial mask under cursor */}
      <motion.img
        src={grassSrc}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-auto"
        style={{
          objectFit: "contain",
          objectPosition: `${side} bottom`,
          zIndex: zGrass,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </div>
  );
}
