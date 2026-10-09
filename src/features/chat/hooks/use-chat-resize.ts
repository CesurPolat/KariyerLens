import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { MESSAGE_TYPES } from "../../../shared/messages.js";

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
  const preferredSize = useRef<Size | undefined>(undefined);
  const changed = useRef(false);
  const drag = useRef<(Size & { x: number; y: number; pointerId: number }) | null>(null);

  useEffect(() => {
    let active = true;
    void chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_CHAT_SIZE }).then(result => {
      const saved = result?.ok ? result.data : null;
      if (!active || changed.current || !saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)
        || saved.width <= 0 || saved.height <= 0 || saved.width > 10000 || saved.height > 10000) return;
      preferredSize.current = { width: saved.width, height: saved.height };
      setSize(clampSize(preferredSize.current));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function resize(next: Size) {
    changed.current = true;
    preferredSize.current = clampSize(next);
    setSize(preferredSize.current);
  }
  function saveSize() {
    if (!preferredSize.current) return;
    void chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SET_CHAT_SIZE, size: preferredSize.current }).catch(() => {});
  }

  useEffect(() => {
    const onResize = () => { if (preferredSize.current) setSize(clampSize(preferredSize.current)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || drag.current || !panel.current) return;
    event.preventDefault();
    changed.current = true;
    const { width, height } = panel.current.getBoundingClientRect();
    drag.current = { width, height, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    resize({ width: start.width + start.x - event.clientX, height: start.height + start.y - event.clientY });
  };
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    saveSize();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !panel.current) return;
    event.preventDefault();
    const { width, height } = panel.current.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 10;
    resize({
      width: width + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
      height: height + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
    });
    saveSize();
  };

  return { panel, size, resizeHandle: { onPointerDown, onPointerMove, onPointerUp: stopDrag, onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag, onKeyDown } };
}
