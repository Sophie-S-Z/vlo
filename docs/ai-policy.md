# Vlo AI policy

Version 2, 8 November 2026. The app shows these words at `/ai-policy` (`src/features/policy/aiPolicy.ts`). A
unit test keeps this file and the page the same.

1. **Vlo trains no model on your text.** Vlo has no AI model of its own to train. Your text is never
   collected to train or improve one.
2. **No Vlo server receives your manuscript text.** Vlo keeps your writing in this browser. An AI request goes
   straight from this browser to the engine you pick, and never through a Vlo server.
3. **Pen mode loads no AI code and sends nothing unless you press "Check the web too".** Each project starts in
   Pen mode. Vlo loads its AI code, the deep AI check included, only after you switch a project to Reader or
   Co-writer mode. In Pen mode, only the web originality check in Insights sends anything: up to 6 short
   phrases from the open item, after you press its button. The network log shows each request that leaves
   this device.
4. **With your own provider key, the provider’s terms apply, and Vlo shows them first.** Before a key for a
   free tier works, Vlo shows the data terms of that provider in plain words and asks you to agree. Before
   each request, Vlo shows the exact text and where it goes.
