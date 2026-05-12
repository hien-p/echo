"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRef } from "react";

/**
 * Walrus-themed "encrypted blob" decoration — the Echo analogue of
 * Synex's photoreal stones. Two stacked SVGs:
 *
 *   - base layer  : cool steel-blue gradient with subtle data-grid
 *                   texture (the "encrypted" state)
 *   - reveal layer: warm amber/cyan gradient with a softer organic
 *                   bloom (the "decrypted" state)
 *
 * On hover, a soft radial CSS mask follows the cursor and reveals the
 * decrypted layer through the encrypted one — same micro-interaction
 * as StoneReveal but with our own visual identity. No hosted PNGs;
 * everything is inline SVG so it ships zero network requests.
 *
 * Mounted three times in the dashboard hero: left + right at the
 * bottom corners (front blobs), and a smaller `variant="back"` in
 * the back-center for depth.
 */
export function WalrusBlob({
  side,
  variant = "front",
  delay = 0.5,
}: {
  side: "left" | "right" | "center";
  variant?: "front" | "back";
  delay?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const radiusRaw = useMotionValue(0);
  const radius = useSpring(radiusRaw, { stiffness: 200, damping: 25 });

  const mask = useTransform(
    [x, y, radius],
    ([lx, ly, lr]) =>
      `radial-gradient(circle ${lr}px at ${lx}px ${ly}px, black 0%, black 40%, transparent 100%)`,
  );

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };

  const isBack = variant === "back";

  // Heights — front blobs match stone proportions; back blob is smaller
  // and centered, sitting lower behind the H1.
  const heightCls = isBack
    ? "h-[180px] sm:h-[220px] md:h-[280px]"
    : "h-[260px] sm:h-[340px] md:h-[440px] lg:h-[520px]";

  const widthCls = isBack
    ? "w-[440px] sm:w-[540px] md:w-[680px]"
    : "w-[420px] sm:w-[520px] md:w-[640px] lg:w-[760px]";

  const sideCls =
    side === "left"
      ? "left-0 origin-bottom-left"
      : side === "right"
        ? "right-0 origin-bottom-right"
        : "left-1/2 -translate-x-1/2 origin-bottom";

  const initialX = side === "left" ? -40 : side === "right" ? 40 : 0;

  return (
    <motion.div
      ref={containerRef}
      onMouseMove={handleMove}
      onMouseEnter={() => radiusRaw.set(140)}
      onMouseLeave={() => radiusRaw.set(0)}
      initial={{ opacity: 0, x: initialX }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.9, delay, ease: "easeOut" }}
      className={`pointer-events-auto absolute bottom-0 ${sideCls} ${widthCls} ${heightCls} cursor-crosshair`}
      style={{ zIndex: isBack ? 0 : side === "left" ? 1 : 4 }}
    >
      <BlobSvg variant="encrypted" side={side} isBack={isBack} />
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      >
        <BlobSvg variant="decrypted" side={side} isBack={isBack} />
      </motion.div>
    </motion.div>
  );
}

/**
 * The actual SVG shape. Organic blob path with two gradient palettes.
 * encrypted = Walrus cool steel (deep navy → cyan haze)
 * decrypted = warm amber bloom (gold → coral) signalling unsealed data
 */
function BlobSvg({
  variant,
  side,
  isBack,
}: {
  variant: "encrypted" | "decrypted";
  side: "left" | "right" | "center";
  isBack: boolean;
}) {
  const gradId = `${variant}-${side}-${isBack ? "b" : "f"}`;
  const isEncrypted = variant === "encrypted";

  // Mirror the path horizontally for the right-hand instance so the
  // tallest mass anchors to the outer edge.
  const transform = side === "right" ? "scale(-1 1) translate(-400 0)" : "";

  return (
    <svg
      viewBox="0 0 400 480"
      preserveAspectRatio="xMidYMax meet"
      className="absolute inset-0 w-full h-full"
      style={{
        filter: isEncrypted
          ? "drop-shadow(0 24px 60px rgba(15,30,55,0.20))"
          : "drop-shadow(0 18px 40px rgba(180,120,40,0.25))",
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          {isEncrypted ? (
            <>
              <stop offset="0%" stopColor="#1F3A52" />
              <stop offset="48%" stopColor="#2F5F7D" />
              <stop offset="100%" stopColor="#16242F" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#F5C77E" />
              <stop offset="50%" stopColor="#D98E4F" />
              <stop offset="100%" stopColor="#7A4B2A" />
            </>
          )}
        </linearGradient>
        <radialGradient id={`${gradId}-hl`} cx="40%" cy="30%" r="60%">
          <stop
            offset="0%"
            stopColor={isEncrypted ? "#7BB3D9" : "#FFE7B8"}
            stopOpacity="0.7"
          />
          <stop offset="100%" stopColor={isEncrypted ? "#1F3A52" : "#D98E4F"} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform={transform}>
        {/* Organic blob path — irregular, with subtle "weathered" peaks */}
        <path
          d="M40,440 C20,360 30,260 80,180 C120,118 180,80 240,90 C300,98 350,150 370,220 C385,275 380,340 360,400 C340,440 280,470 200,470 C130,470 60,470 40,440 Z"
          fill={`url(#${gradId})`}
        />
        {/* Subtle highlight bloom on top-left */}
        <path
          d="M40,440 C20,360 30,260 80,180 C120,118 180,80 240,90 C300,98 350,150 370,220 C385,275 380,340 360,400 C340,440 280,470 200,470 C130,470 60,470 40,440 Z"
          fill={`url(#${gradId}-hl)`}
          opacity={isBack ? 0.4 : 0.6}
        />
        {/* Faint data-grid texture on the encrypted variant */}
        {isEncrypted && !isBack && (
          <g opacity="0.10" stroke="#A8D4F0" strokeWidth="0.5">
            {[100, 140, 180, 220, 260, 300, 340, 380].map((y) => (
              <line key={y} x1="60" y1={y} x2="360" y2={y} />
            ))}
            {[80, 120, 160, 200, 240, 280, 320].map((x) => (
              <line key={x} x1={x} y1="100" x2={x} y2="460" />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
