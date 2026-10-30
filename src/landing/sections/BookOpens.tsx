import { BOOK } from "../copy";
import { BookArt } from "../art/BookArt";
import { Eyebrow, Page } from "./Page";

export function BookOpens() {
  return (
    <Page n={3} id="book" titleId="book-title" className="mx-auto max-w-6xl">
      <Eyebrow n={3}>The book opens</Eyebrow>
      <h2 id="book-title" className="sr-only">
        {BOOK.title}
      </h2>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <BookArt />
        <ol data-book-steps className="space-y-8">
          {BOOK.captions.map((caption, i) => (
            <li key={caption} className="flex gap-4 border-t border-rule pt-4">
              <span className="font-mono text-xs text-accent-text">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="font-display text-2xl leading-snug sm:text-3xl">{caption}</p>
            </li>
          ))}
        </ol>
      </div>
    </Page>
  );
}
