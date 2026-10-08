import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type Size = { width: number; height: number };

function clampSize({ width, height }: Size): Size {
  const maxWidth = Math.max(0, window.innerWidth - 32);
  const maxHeight = Math.max(0, window.innerHeight - (window.innerHeight <= 600 ? 100 : 110));
  return {
    width: Math.min(maxWidth, Math.max(320, width)),
    height: Math.min(maxHeight, Math.max(400, height)),
  };
}

export function useChatResize() {
  const panel = useRef<HTMLElement>(null);
  const [size, setSize] = useState<Size>();
  const drag = useRef<(Size & { x: number; y: number; pointerId: number }) | null>(null);

  useEffect(() => {
    const onResize = () => setSize(current => current && clampSize(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || drag.current || !panel.current) return;
    event.preventDefault();
    const { width, height } = panel.current.getBoundingClientRect();
    drag.current = { width, height, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setSize(clampSize({ width: start.width + start.x - event.clientX, height: start.height + start.y - event.clientY }));
  };
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !panel.current) return;
    event.preventDefault();
    const { width, height } = panel.current.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 10;
    setSize(clampSize({
      width: width + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
      height: height + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
    }));
  };

  return { panel, size, resizeHandle: { onPointerDown, onPointerMove, onPointerUp: stopDrag, onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag, onKeyDown } };
}
