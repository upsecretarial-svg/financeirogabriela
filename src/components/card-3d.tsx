import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface Card3DProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  intensity?: number;
}

/**
 * Card com tilt 3D reagindo ao mouse. Sem GPU/WebGL — puro CSS transform.
 */
export function Card3D({ children, className, glow = false, intensity = 8 }: Card3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springCfg = { stiffness: 200, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [intensity, -intensity]), springCfg);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-intensity, intensity]), springCfg);
  const glareX = useTransform(mx, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(my, [-0.5, 0.5], ["0%", "100%"]);

  const handle = (e: MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handle}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1200 }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius)] transition-all duration-300",
        "border border-border bg-card/60 backdrop-blur-2xl dark:border-white/10 dark:bg-gradient-to-br dark:from-white/[0.08] dark:to-white/[0.03]",
        "shadow-sm hover:shadow-xl dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_40px_-20px_rgba(0,0,0,0.6)]",
        "dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_30px_60px_-15px_rgba(79,70,229,0.5)]",
        glow && "hover:ring-1 hover:ring-primary/50",
        className,
      )}
    >
      {/* Glare */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useTransform(
            [glareX, glareY],
            ([x, y]) =>
              `radial-gradient(600px circle at ${x} ${y}, rgba(129,140,248,0.18), transparent 40%)`,
          ),
        }}
      />
      <div style={{ transform: "translateZ(0)" }} className="relative h-full">
        {children}
      </div>
    </motion.div>
  );
}
