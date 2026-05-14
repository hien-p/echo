"use client";

import { useEffect } from "react";

/**
 * Strips browser-extension attributes that get injected onto random
 * DOM nodes after server-render but before / during React hydration —
 * the main culprits are anti-tracker / privacy extensions:
 *
 *   - Bitdefender (`bis_skin_checked`, `bis_register`,
 *     `__processed_bis_register__`)
 *   - ColorZilla / similar (`cz-shortcut-listen`)
 *   - DarkReader (`data-darkreader-inline-*`)
 *
 * React 19 strict hydration logs a mismatch when it sees these on
 * client that weren't in the server payload, and the Next 15 dev
 * overlay treats it as an error and covers the page.
 *
 * Inline `<script dangerouslySetInnerHTML>` in <head> doesn't work
 * because some extensions also rewrite the script tag itself with
 * `bis_use="true"`, `src="chrome-extension://…"`, etc., which causes a
 * second mismatch on the patch. A "use client" component avoids that:
 * nothing renders into the DOM, the observer is set up in useEffect
 * (after React owns the tree), and we strip the attrs as they arrive.
 *
 * Best-effort: try/catch on observer construction so older browsers
 * silently no-op. Reduced-motion / privacy-mode safe (no network or
 * storage I/O).
 */

const STRIP = [
  "bis_skin_checked",
  "bis_register",
  "__processed_bis_register__",
  "cz-shortcut-listen",
];

const STRIP_PREFIXES = ["data-darkreader-"];

export function ExtensionAttrStripper(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanNode = (node: Element) => {
      for (const name of STRIP) {
        if (node.hasAttribute(name)) node.removeAttribute(name);
      }
      // Prefix sweep — DarkReader emits many variants.
      const attrs = node.attributes;
      for (let i = attrs.length - 1; i >= 0; i--) {
        const an = attrs[i]?.name ?? "";
        for (const pfx of STRIP_PREFIXES) {
          if (an.startsWith(pfx)) {
            node.removeAttribute(an);
            break;
          }
        }
      }
    };

    // Initial sweep
    try {
      document.querySelectorAll("*").forEach((el) => cleanNode(el));
    } catch {
      /* ignore */
    }

    let mo: MutationObserver | null = null;
    try {
      mo = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "attributes") {
            const target = r.target as Element;
            const attr = r.attributeName ?? "";
            if (
              STRIP.includes(attr) ||
              STRIP_PREFIXES.some((p) => attr.startsWith(p))
            ) {
              target.removeAttribute(attr);
            }
          } else if (r.type === "childList") {
            r.addedNodes.forEach((n) => {
              if (n.nodeType === 1) {
                cleanNode(n as Element);
                (n as Element)
                  .querySelectorAll?.("*")
                  .forEach((el) => cleanNode(el));
              }
            });
          }
        }
      });
      mo.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    } catch {
      /* MutationObserver unavailable — best-effort */
    }

    return () => {
      try {
        mo?.disconnect();
      } catch {
        /* */
      }
    };
  }, []);

  return null;
}
