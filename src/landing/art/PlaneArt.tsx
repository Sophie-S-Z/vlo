/** Still art: a paper plane (fallback for the M1b particle plane). */
export function PlaneArt() {
  return (
    <svg
      data-still-art="plane"
      viewBox="0 0 120 60"
      className="mb-8 w-28 text-fg"
      aria-hidden="true"
    >
      <path
        d="M4 30 L116 4 L70 56 L56 36 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M56 36 L116 4" fill="none" stroke="var(--vlo-accent)" strokeWidth="1.5" />
    </svg>
  );
}
