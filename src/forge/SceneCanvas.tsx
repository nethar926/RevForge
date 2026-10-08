import { useEffect, useRef } from "react";
import { useA11y } from "../hooks/useA11yPrefs";
import { drawScene } from "./scenes";
import type { ScenePack } from "./catalog";
import type { Simulation } from "./simulation";

export function SceneCanvas({
  scene,
  simulation,
  motion,
}: {
  scene: ScenePack;
  simulation: { current: Simulation };
  motion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { reduceMotion } = useA11y();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let width = 1,
      height = 1,
      frame = 0,
      previous = 0;
    // Reduce Motion (system or in-app) or Animated environment off: draw one
    // static frame and stop the rAF loop entirely (redraw only on resize).
    const reduced =
      reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !motion;
    const drawStatic = () =>
      drawScene(ctx, width, height, { sim: { speedMps: 0, distance: 0 }, pack: scene, motion: 0, time: 0 });
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawStatic();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (now: number) => {
      if (
        now - previous >= 1000 / 30 &&
        document.visibilityState !== "hidden"
      ) {
        previous = now;
        drawScene(ctx, width, height, {
          sim: reduced ? { speedMps: 0, distance: 0 } : simulation.current,
          pack: scene,
          motion: reduced ? 0 : 0.65,
          time: reduced ? 0 : now / 1000,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    if (!reduced) frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [scene, simulation, motion, reduceMotion]);
  return (
    <canvas
      ref={canvasRef}
      className="forge-scene-canvas"
      aria-label={`${scene.name} environment`}
      role="img"
    />
  );
}
