import type { Variants } from "motion/react";
import { motion } from "motion/react";
import { createAnimatedIcon } from "./create-icon";

const VARIANTS: Variants = {
  normal: { rotate: 0, transition: { duration: 0.3, ease: "easeOut" } },
  animate: { rotate: [0, -20, 25, 0], transition: { duration: 0.8, times: [0, 0.6, 0.8, 1], ease: ["easeInOut", "easeOut", "easeOut"] } },
};

export const HammerIcon = createAnimatedIcon("HammerIcon", (controls, size) => (
  <motion.svg animate={controls} fill="none" height={size} initial="normal" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" style={{ transformOrigin: "0% 100%", transformBox: "fill-box" }} variants={VARIANTS} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
    <path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" />
    <path d="m18 15 4-4" />
    <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
  </motion.svg>
));
