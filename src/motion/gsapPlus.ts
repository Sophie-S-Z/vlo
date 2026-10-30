import { Draggable } from "gsap/Draggable";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { gsap } from "./gsap";

/**
 * GSAP plugins that only the section demos below the fold use. They load with those demos,
 * after the first screen starts, so their parse never joins the first long task (TBT).
 */
gsap.registerPlugin(Draggable, DrawSVGPlugin, Flip, InertiaPlugin);

export { Draggable, Flip, gsap };
