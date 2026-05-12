import type { ReactNode } from "react";

/**
 * Visually-hidden "Skip to main content" link that becomes visible on
 * focus. Mount as the FIRST child of <body> (above NavPill) so a
 * keyboard user's first Tab keystroke lands here. Styling lives in
 * globals.css `.skip-to-content` so the rule isn't subject to
 * Tailwind 4 t-shirt-key shadowing.
 *
 * Target id `#main-content` matches the <main> element in app/layout.tsx.
 */
export function SkipToContent(): ReactNode {
  return (
    <a href="#main-content" className="skip-to-content">
      Skip to main content
    </a>
  );
}
