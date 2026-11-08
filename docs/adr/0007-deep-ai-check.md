# ADR 0007: A deep AI check with the in-browser language model

- Status: accepted
- Date: 2026-11-08

## Context

The style check of ADR 0006 caught only 3 of 14 texts by a 2026 model. The product owner asked for a deeper check that is more accurate and free. The strongest free detectors are zero-shot methods that read the text with a language model: Fast-DetectGPT (Bao et al., ICLR 2024) and Binoculars (Hans et al., ICML 2024). Binoculars needs two models that share a tokenizer, such as a base model and its chat model. WebLLM, which Vlo already uses for the co-writer, offers no such pair under 3B parameters. Fast-DetectGPT works with one model.

## Decision

- **Method.** The deep check uses the analytic criterion of Fast-DetectGPT, with one model for sampling and for scoring. For each token it compares the log probability of the token in the text with the mean log probability under the model's own next-token distribution, and divides by the standard deviation. Vlo divides the result by the square root of the token count, so that long and short texts share one scale.
- **Model.** The check uses the co-writer's WebLLM models (Qwen2.5 1.5B or SmolLM2 1.7B). A writer who already downloaded one for the co-writer downloads nothing new. No new package is needed. The check needs WebGPU, as the co-writer does.
- **WebLLM fields.** WebLLM 0.2.87 has no public call for the tokenizer or for the logits of a given text. The check reads the pipeline's tokenizer and sets the pipeline's logit processor while it runs, then feeds the text one token at a time with `forwardTokensAndSample`. The version stays pinned, and `tests/unit/deep-webllm.test.ts` fails when an update changes these fields.
- **Calibration on the device.** The scale of the criterion changes with the model and its quantization, and the container that built this feature could not download a model. So the first run for each model reads 26 reference passages (`src/features/analysis/deep/references.ts`, built by `scripts/build-deep-references.mjs`): 17 human passages from public domain books, State of the Union addresses and European Parliament debates, and 9 AI passages from ChatGPT, Claude and the newer-model test set. The cuts come from a normal fit of the human scores, at the 90th percentile ("some") and the 99th ("many"). The AI passages only measure the cuts. Vlo keeps the result in appMeta under `deep-calibration:<model>` and shows it in the report. When the model catches fewer than half of the AI passages, the report says that its result means little on this device.
- **Report.** The deep check is a separate opinion under the style result. It scores passages of six sentences, as the style check does, marks the predictable ones, and says in one line whether the two checks agree. It reads at most 1,536 tokens (about 1,100 words), in blocks of up to 512 tokens spread over the text, and says how much it read.

## Consequences

- The check costs about one model step for each token: from tens of seconds for a page to about a minute for the longest texts, and about two minutes once for the calibration.
- Its accuracy is measured on each device, on 26 passages, and not on a large test set. A later step can run the full test set through the model on a machine that can download it, and set fixed cuts.
- Known limits of all likelihood checks apply: text that a model knows by heart scores high, simple writing by learners of English can score high, and a person who rewrites AI text lowers its score.
- The co-writer and the deep check share one model, so each waits for the other.

Update, 2026-11-08: the deep check needs Reader or Co-writer mode, because Pen mode loads no AI code. In Pen
mode the AI tab says so, and the check's code (`DeepCheck.tsx` and the WebLLM wrapper) loads as its own chunk
only outside Pen mode (product owner decision).
