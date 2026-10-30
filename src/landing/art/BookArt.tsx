/** Still art: an open book with lifted pages (fallback for the M1b particle book). */
export function BookArt() {
  return (
    <svg data-still-art="book" viewBox="0 0 320 220" className="w-full text-fg" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M160 40 C120 22 60 22 20 34 V196 C60 184 120 184 160 202 Z" opacity="0.9" />
        <path d="M160 40 C200 22 260 22 300 34 V196 C260 184 200 184 160 202 Z" opacity="0.9" />
        <path d="M160 40 C190 10 240 6 282 14" opacity="0.5" />
        <path d="M160 40 C186 2 228 -4 262 0" opacity="0.35" />
        <path d="M160 40 V202" />
      </g>
      <g stroke="currentColor" strokeWidth="1" opacity="0.35">
        {[60, 76, 92, 108, 124, 140, 156].map((y) => (
          <g key={y}>
            <line x1="40" y1={y} x2="140" y2={y + 4} />
            <line x1="180" y1={y + 4} x2={y === 108 ? 240 : 280} y2={y} />
          </g>
        ))}
      </g>
      <circle cx="252" cy="108" r="3" fill="var(--vlo-accent)" />
    </svg>
  );
}
