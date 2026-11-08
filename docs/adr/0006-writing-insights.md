# ADR 0006: Writing insights, an AI writing check and an originality check

- Status: accepted
- Date: 2026-11-08

## Context

The product owner asked for the counts and scores that word-count sites show, shown quietly while the writer types, and for a free AI writing check and plagiarism check that match the features of Turnitin (the checker that Canvas uses). Turnitin's models and its source database are not public. A detector can never be certain.

## Decision

- **Stats bar.** A one-line bar under the text shows counts that the writer picks (words, characters, sentences, reading time, reading grade and more). It counts in a Web Worker 700 ms after typing stops, and the numbers change with no motion. The writer can hide it.
- **Insights panel.** A side panel that loads on first open, with four tabs: Stats (counts, times, sentence and word measures, seven readability scores), Keywords (density of words and of two- and three-word phrases), AI check and Originality. Each report can select the words that it names.
- **AI check.** A small neural network (one hidden layer of 16 units) reads about 170 style measures: sentence and paragraph rhythm, word variety, punctuation, common-word rates, a lexicon of words that human and AI texts use at different rates, and the signs of the Humanizer and humanize-writing skills. `scripts/train-ai-detector.mjs` fits it on the Ghostbuster benchmark (human, ChatGPT and Claude texts that answer the same prompts), learner essays, Project Gutenberg fiction and 14 newer-model texts in `scripts/ai-detector-data/`. The model ships as numbers in `src/features/analysis/ai/model.ts` (about 20 KB gzip, in the worker chunk). Like Turnitin, the report scores passages of about six sentences, gives no overall result under 150 words, and shows no percent between 1% and 19%. The thresholds come from native human texts: about 1 in 100 reaches "many signs". Vlo's own co-writer marks (F26) come first, because they are a record and not a guess. The check also flags hidden-text tricks: invisible characters, look-alike letters from another alphabet, and odd spaces.
- **Originality check.** Copied runs come from 5-word shingles of light word stems, joined where they touch. Close paraphrases come from the overlap of content words between sentences. Filters match Turnitin's: leave out quotations, a reference list and matches under a number of words. The sources are the writer's other items, sources that the writer pastes in, and, only when the writer presses "Check the web too", Wikipedia and OpenAlex.
- **Network.** A new purpose, `originality`, may reach `en.wikipedia.org` and `api.openalex.org`. Both are free and need no key. The web check sends up to 6 phrases of up to 12 words, never the whole text. The network log records each request. The product owner chose this option on 2026-11-08, which adds a fourth kind of data that can leave the device (spec principle 2), always on the writer's action.

## Test results

On 4,784 texts that the model never saw: AUC 0.999, 98.0% of AI texts caught, 1.3% of human texts flagged (4.0% of the casual Reddit stories and 3.4% of the student essays, 0% of 270 fiction passages, under 1% of learner essays). 97% of texts that the undetectable.ai paraphraser changed were caught. Of 14 texts by a 2026 model, written in a careful, plain style, only 3 were caught. The report says so.

## Consequences

- The check is free, offline and private, and its numbers are measured and public. It is weaker than a check with a large language model on texts that newer models wrote or that a person edited. A later step can add a perplexity check with the in-browser model of WebLLM, for writers who have downloaded one.
- A change to the feature code needs a new training run. A unit test fails when the model and the feature names differ.
- The web check cannot search student papers or paid journals, so a clean result is not a guarantee.
