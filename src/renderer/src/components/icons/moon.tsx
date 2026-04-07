import { motion } from "motion/react";
import { createAnimatedIcon } from "./create-icon";

export const MoonIcon = createAnimatedIcon("MoonIcon", (controls, size) => (
  <motion.svg animate={controls} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" transition={{ duration: 1.2, ease: "easeInOut" }} variants={{ normal: { rotate: 0 }, animate: { rotate: [0, -10, 10, -5, 5, 0] } }} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </motion.svg>
));
