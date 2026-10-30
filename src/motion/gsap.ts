import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Draggable } from "gsap/Draggable";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * The one place that registers GSAP plugins. Import it only through a dynamic
 * import() chain: the bundle check keeps gsap out of the initial chunks.
 */
gsap.registerPlugin(
  CustomEase,
  Draggable,
  DrawSVGPlugin,
  Flip,
  InertiaPlugin,
  MorphSVGPlugin,
  ScrambleTextPlugin,
  ScrollTrigger,
  SplitText,
);

/** Same curve as --vlo-ease in tokens.css. */
export const VLO_EASE = CustomEase.create("vlo", "M0,0 C0.65,0 0.35,1 1,1");

export { Draggable, Flip, gsap, MorphSVGPlugin, ScrollTrigger, SplitText };
