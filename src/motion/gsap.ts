import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * Registers the GSAP plugins that the first screen and the nav need; `gsapPlus.ts` registers
 * the rest. Import it only through a dynamic import() chain: the bundle check keeps gsap out
 * of the initial chunks.
 */
gsap.registerPlugin(CustomEase, MorphSVGPlugin, ScrambleTextPlugin, ScrollTrigger, SplitText);

/** Same curve as --vlo-ease in tokens.css. */
export const VLO_EASE = CustomEase.create("vlo", "M0,0 C0.65,0 0.35,1 1,1");

export { gsap, MorphSVGPlugin, ScrollTrigger, SplitText };
