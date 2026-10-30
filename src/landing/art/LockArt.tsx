/** Still art: a padlock drawn from text lines (fallback for the M1b particle padlock). */
export function LockArt() {
  return (
    <svg
      data-still-art="lock"
      viewBox="0 0 120 150"
      className="mx-auto w-40 text-fg"
      aria-hidden="true"
    >
      <path
        d="M30 64 V44 a30 30 0 0 1 60 0 V64"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="64"
        width="92"
        height="76"
        rx="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {[80, 92, 104, 116, 128].map((y, i) => (
        <line
          key={y}
          x1="26"
          y1={y}
          x2={i === 2 ? 70 : 94}
          y2={y}
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.4"
        />
      ))}
      <circle cx="60" cy="102" r="6" fill="var(--vlo-accent)" />
    </svg>
  );
}
