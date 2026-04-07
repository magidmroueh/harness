import { motion } from "motion/react";
import { createAnimatedIcon } from "./create-icon";

const D = 0.3;
const dl = (i: number) => (i === 0 ? 0.1 : i * D + 0.1);
const draw = (i: number) => ({ duration: D, delay: dl(i), opacity: { delay: dl(i) } });
const drawV = { normal: { pathLength: 1, opacity: 1, transition: { delay: 0 } }, animate: { pathLength: [0, 1], opacity: [0, 1] } };
const pathV = { normal: { pathLength: 1, pathOffset: 0, opacity: 1, transition: { delay: 0 } }, animate: { pathLength: [0, 1], opacity: [0, 1], pathOffset: [1, 0] } };

export const GitBranchIcon = createAnimatedIcon("GitBranchIcon", (controls, size) => (
  <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
    <motion.circle animate={controls} cx="18" cy="6" r="3" transition={draw(0)} variants={drawV} />
    <motion.line animate={controls} transition={draw(1)} variants={pathV} x1="6" x2="6" y1="3" y2="15" />
    <motion.circle animate={controls} cx="6" cy="18" r="3" transition={draw(2)} variants={drawV} />
    <motion.path animate={controls} d="M18 9a9 9 0 0 1-9 9" transition={draw(1)} variants={pathV} />
  </svg>
));
