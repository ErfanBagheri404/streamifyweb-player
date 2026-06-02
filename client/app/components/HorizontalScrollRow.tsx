"use client";

import React, { ReactNode, useEffect, useRef, useState } from "react";

interface HorizontalScrollRowProps {
  children: ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  buttonClassName?: string;
  step?: number;
}

function ChevronDownGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function HorizontalScrollRow({
  children,
  containerClassName = "",
  contentClassName = "",
  buttonClassName = "",
  step,
}: HorizontalScrollRowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      setCanScrollLeft(container.scrollLeft > 8);
      const remaining =
        container.scrollWidth - container.clientWidth - container.scrollLeft;
      setCanScrollRight(remaining > 8);
    };

    updateScrollState();
    container.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollState)
        : null;
    resizeObserver?.observe(container);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [children]);

  const handleScrollBackward = () => {
    const container = containerRef.current;
    if (!container) return;

    const nextStep = step ?? Math.max(container.clientWidth * 0.85, 180);
    const distance = Math.min(container.scrollLeft, nextStep);
    if (distance <= 0) return;

    container.scrollBy({
      left: -distance,
      behavior: "smooth",
    });
  };

  const handleScrollForward = () => {
    const container = containerRef.current;
    if (!container) return;

    const remaining =
      container.scrollWidth - container.clientWidth - container.scrollLeft;
    if (remaining <= 0) return;

    const nextStep = step ?? Math.max(container.clientWidth * 0.85, 180);
    const distance = remaining <= nextStep * 1.2 ? remaining : nextStep;

    container.scrollBy({
      left: distance,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`overflow-x-auto hide-scrollbar ${containerClassName}`.trim()}
      >
        <div className={contentClassName}>{children}</div>
      </div>

      {canScrollLeft ? (
        <button
          type="button"
          onClick={handleScrollBackward}
          className={`absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:scale-[1.03] hover:bg-black/80 ${buttonClassName}`.trim()}
          aria-label="Scroll row to the left"
        >
          <ChevronDownGlyph className="h-4 w-4 rotate-90" />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          onClick={handleScrollForward}
          className={`absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:scale-[1.03] hover:bg-black/80 ${buttonClassName}`.trim()}
          aria-label="Scroll row to the right"
        >
          <ChevronDownGlyph className="h-4 w-4 -rotate-90" />
        </button>
      ) : null}
    </div>
  );
}
