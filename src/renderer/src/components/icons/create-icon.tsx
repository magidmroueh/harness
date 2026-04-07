import { useAnimation } from "motion/react";
import type { AnimationControls } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { IconHandle } from "../../types";

interface AnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

/**
 * Factory for creating animated icon components.
 * Eliminates boilerplate — each icon only provides its SVG render function.
 */
export function createAnimatedIcon(
  displayName: string,
  renderSvg: (controls: AnimationControls, size: number) => React.ReactNode,
) {
  const Icon = forwardRef<IconHandle, AnimatedIconProps>(
    ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
      const controls = useAnimation();
      const isControlledRef = useRef(false);
      useImperativeHandle(ref, () => {
        isControlledRef.current = true;
        return {
          startAnimation: () => controls.start("animate"),
          stopAnimation: () => controls.start("normal"),
        };
      });
      const handleMouseEnter = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          isControlledRef.current ? onMouseEnter?.(e) : controls.start("animate");
        },
        [controls, onMouseEnter],
      );
      const handleMouseLeave = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          isControlledRef.current ? onMouseLeave?.(e) : controls.start("normal");
        },
        [controls, onMouseLeave],
      );
      return (
        <div className={className} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
          {renderSvg(controls, size)}
        </div>
      );
    },
  );
  Icon.displayName = displayName;
  return Icon;
}
