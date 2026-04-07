import type { Variants } from "motion/react";
import { motion } from "motion/react";
import { createAnimatedIcon } from "./create-icon";

const VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: (custom: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { delay: 0.15 * custom, opacity: { delay: 0.1 * custom } },
  }),
};

export const GitCommitIcon = createAnimatedIcon("GitCommitIcon", (controls, size) => (
  <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
    <motion.circle animate={controls} custom={1} cx="12" cy="12" r="3" variants={VARIANTS} />
    <motion.line animate={controls} custom={0} variants={VARIANTS} x1="3" x2="9" y1="12" y2="12" />
    <motion.line animate={controls} custom={2} variants={VARIANTS} x1="15" x2="21" y1="12" y2="12" />
  </svg>
));
