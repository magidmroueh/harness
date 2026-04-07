import type { Variants } from "motion/react";
import { motion } from "motion/react";
import { createAnimatedIcon } from "./create-icon";

const LINE_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0, 1],
    transition: { duration: 0.8, repeat: Infinity, ease: "linear" },
  },
};

export const TerminalIcon = createAnimatedIcon("TerminalIcon", (controls, size) => (
  <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
    <polyline points="4 17 10 11 4 5" />
    <motion.line animate={controls} initial="normal" variants={LINE_VARIANTS} x1="12" x2="20" y1="19" y2="19" />
  </svg>
));
