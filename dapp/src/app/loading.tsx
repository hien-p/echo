export default function Loading() {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        color: "var(--echo-mut, #737373)",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          border: "2px solid rgba(0,0,0,0.08)",
          borderTopColor: "var(--echo-sui-sea, #4DA2FF)",
          animation: "ff-spin 0.9s linear infinite",
        }}
      />
      <span>fetching from walrus…</span>
      <span style={{ color: "var(--echo-mut-2, #A8A8A8)" }}>
        first load can take a few seconds while aggregators warm
      </span>
    </div>
  );
}
