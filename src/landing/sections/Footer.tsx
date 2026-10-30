import { Link } from "react-router";
import { SoundSwitch } from "@/audio/SoundSwitch";
import { CalmSwitch } from "@/motion/CalmSwitch";
import { ThemeSwitch } from "@/ui/theme/ThemeSwitch";
import { setInkLabOpen } from "../lab/settings";
import { TAGLINE } from "../copy";

const ASCII = String.raw`
 __      __  _
 \ \    / / | |   ___
  \ \  / /  | |  / _ \
   \ \/ /   | | | (_) |
    \__/    |_|  \___/
`;

/** Column where each letter of the ASCII wordmark starts: V, l, o. */
const LETTER_COLUMNS = [0, 12, 17];
const LINES = ASCII.split("\n").filter(Boolean);
const WIDTH = Math.max(...LINES.map((line) => line.length));

/** The wordmark cut into one block per letter, for the hover wave (spec 18.3 footer). */
const ASCII_LETTERS = LETTER_COLUMNS.map((start, i) => {
  const end = LETTER_COLUMNS[i + 1] ?? WIDTH;
  return LINES.map((line) => line.padEnd(WIDTH).slice(start, end)).join("\n");
});

export function Footer() {
  return (
    <footer className="border-t border-rule px-4 pt-16 pb-24 sm:px-8">
      <div
        aria-hidden="true"
        className="overflow-hidden whitespace-nowrap font-display text-5xl text-muted italic sm:text-7xl"
      >
        <p data-ticker className="inline-block">
          {Array.from({ length: 6 }, () => TAGLINE).join(" ")}
        </p>
      </div>
      <div className="mx-auto mt-16 flex max-w-6xl flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <pre
            data-ascii
            aria-hidden="true"
            className="font-mono text-xs leading-tight text-accent-text"
          >
            {ASCII_LETTERS.map((letter, i) => (
              <span
                key={i}
                data-wave-letter
                className="inline-block"
                style={{ "--i": i } as React.CSSProperties}
              >
                {letter}
              </span>
            ))}
          </pre>
          <p className="sr-only">Vlo</p>
          <p className="mt-4 font-mono text-xs text-muted">
            Free. Local-first. Pen mode by default.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase">
            <li>
              <Link to="/privacy" className="underline-offset-4 hover:underline">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/ai-policy" className="underline-offset-4 hover:underline">
                AI policy
              </Link>
            </li>
            <li>
              <button
                type="button"
                data-ink-lab-button
                onClick={() => setInkLabOpen(true)}
                className="inline-flex min-h-11 items-center uppercase underline-offset-4 hover:underline"
              >
                Ink lab
              </button>
            </li>
            <li>
              <ThemeSwitch />
            </li>
            <li>
              <SoundSwitch />
            </li>
            <li>
              <CalmSwitch />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
