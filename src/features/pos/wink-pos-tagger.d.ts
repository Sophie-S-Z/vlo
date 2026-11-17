// wink-pos-tagger ships no types. Vlo uses only `tagSentence`.
declare module 'wink-pos-tagger' {
  interface Tagger {
    tagSentence: (sentence: string) => { value: string; pos: string; tag: string }[];
  }
  const posTagger: () => Tagger;
  export default posTagger;
}
