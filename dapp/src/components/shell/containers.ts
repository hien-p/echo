/**
 * Container width tokens.
 *
 * This project's Tailwind 4 @theme block shadows the t-shirt keys
 * (max-w-md / lg / xl / 2xl / 3xl / max-w-360) onto spacing tokens, so
 * those classes resolve to ~px values instead of the canonical
 * 28rem / 32rem / 42rem / 90rem widths.
 *
 * Use these constants (or the arbitrary classes inline) anywhere a
 * container needs an actual semantic width. See the comment in
 * dapp/src/app/globals.css around line 50 for the full context.
 */

export const CONTAINER_WIDE = "max-w-[1440px]"; // marketing + bento
export const CONTAINER_PROSE = "max-w-[680px]"; // takeover form viewer width
export const CONTAINER_APP = "max-w-[1280px]"; // interior app routes
export const CONTAINER_NARROW = "max-w-[768px]"; // settings, lists, narrower content
export const CONTAINER_TIGHT = "max-w-[420px]"; // gates, login, dialogs
