/** The shape of the trained AI writing model in model.ts. */
export interface ModelData {
  /** The feature names, in the order of `featuresOf`. A check compares them with FEATURE_NAMES. */
  features: readonly string[];
  /** Words with the log odds of AI use. */
  lexicon: readonly (readonly [string, number])[];
  means: readonly number[];
  scales: readonly number[];
  /** One row of weights for each hidden unit. */
  hidden: readonly (readonly number[])[];
  hiddenBias: readonly number[];
  output: readonly number[];
  outputBias: number;
  /** A whole text at or above this score is likely AI: at most 1% of native human texts in training reach it. */
  threshold: number;
  /** A passage at or above this score is marked: at most 3% of native human passages in training reach it. */
  windowThreshold: number;
  /** Below this score, a whole text shows few signs: 90% of native human texts in training score higher. */
  looseThreshold: number;
  minWords: number;
  /** Signs per 100 words in native human texts: the median, the 90th and the 99th percentile. */
  humanTells: readonly number[];
}
