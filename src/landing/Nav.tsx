import { CalmSwitch } from "@/motion/CalmSwitch";
import { ThemeSwitch } from "@/ui/theme/ThemeSwitch";

const LINKS = [
  { href: "#forms", label: "Forms" },
  { href: "#privacy", label: "Privacy" },
  { href: "#ai", label: "AI" },
  { href: "#faq", label: "FAQ" },
];

/** Landing nav (spec 18.1 items 2 and 4). Effects attach through data-* hooks. */
export function Nav() {
  return (
    <header
      data-nav
      className="fixed inset-x-0 top-0 z-40 border-b border-rule bg-bg/85 backdrop-blur-sm transition-transform duration-500 ease-vlo"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2 sm:px-8">
        <a
          href="#top"
          data-logo
          aria-label="Vlo, back to top"
          className="relative grid size-10 place-items-center"
        >
          <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
            <path
              data-logo-path
              d="M6 7l10 19 10-19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex gap-6 font-mono text-xs tracking-widest uppercase">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a data-scramble href={link.href} className="nav-link py-2">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <ThemeSwitch className="gap-0 sm:gap-1" />
          <CalmSwitch />
          <a
            href="#waitlist"
            data-magnetic
            className="ml-1 hidden rounded-full bg-accent-text px-4 py-2 text-sm font-medium text-bg sm:inline-block"
          >
            Join
          </a>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="h-px origin-left bg-accent"
        data-ink-line
        style={{ transform: "scaleX(0)" }}
      />
    </header>
  );
}

/** Fixed "p. 01 / 10" counter (spec 18.1 item 3). Decorative; sections carry their own labels. */
export function PageCounter() {
  return (
    <p
      aria-hidden="true"
      data-page-counter
      className="pointer-events-none fixed right-4 bottom-4 z-30 hidden font-mono text-xs text-muted sm:block"
    >
      p. <span data-page-current>01</span> / 10
    </p>
  );
}
