import type { Variants } from "motion/react";
import { motion } from "motion/react";
import { createAnimatedIcon } from "./create-icon";

const PATH_VARIANTS: Variants = {
  normal: { opacity: 1, pathLength: 1, scale: 1, transition: { duration: 0.3, opacity: { duration: 0.1 } } },
  animate: (custom: number) => ({
    opacity: [0, 1],
    pathLength: [0, 1],
    scale: [0.5, 1],
    transition: { duration: 0.4, opacity: { duration: 0.1 }, delay: 0.1 * custom },
  }),
};

export const CheckCheckIcon = createAnimatedIcon("CheckCheckIcon", (controls, size) => (
  <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
    <motion.path animate={controls} custom={0} d="M2 12 7 17L18 6" initial="normal" variants={PATH_VARIANTS} />
    <motion.path animate={controls} custom={1} d="M13 16L14.5 17.5L22 10" initial="normal" variants={PATH_VARIANTS} />
  </svg>
));
