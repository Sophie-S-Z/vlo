import { useId, useState } from "react";
import { FIRST_LINE_MAX, setFirstLine } from "../firstLine";
import { HERO } from "../copy";

/**
 * "Your first line" (ADR 0012). The typed words form the particle shape in the hero. The text
 * stays in page memory: no form, no storage, no spell-check service.
 */
export function FirstLineField() {
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <div className="mt-8 max-w-xl">
      <label htmlFor={id} className="font-mono text-xs tracking-widest text-muted uppercase">
        {HERO.firstLineLabel}
      </label>
      <input
        id={id}
        data-first-line
        type="text"
        value={value}
        maxLength={FIRST_LINE_MAX}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="sentences"
        enterKeyHint="done"
        placeholder={HERO.firstLinePlaceholder}
        aria-describedby={`${id}-note`}
        onChange={(event) => {
          setValue(event.target.value);
          setFirstLine(event.target.value);
        }}
        className="mt-2 block w-full border-b border-rule bg-transparent py-2 font-display text-2xl text-fg outline-none placeholder:text-muted focus:border-accent sm:text-3xl"
      />
      <p id={`${id}-note`} className="mt-2 font-mono text-xs text-muted">
        {HERO.firstLineNote}
      </p>
    </div>
  );
}
