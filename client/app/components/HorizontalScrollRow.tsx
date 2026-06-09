"use client";

import React, {
  ReactNode,
  CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAppLanguage } from "../hooks/useAppLanguage";

interface HorizontalScrollRowProps {
  children: ReactNode;
  containerClassName?: string;
  containerStyle?: CSSProperties;
  contentClassName?: string;
  buttonClassName?: string;
  step?: number;
}

type RtlScrollType = "default" | "negative" | "reverse";

let cachedRtlScrollType: RtlScrollType | null = null;

function getRtlScrollType(): RtlScrollType {
  if (cachedRtlScrollType) {
    return cachedRtlScrollType;
  }

  if (typeof document === "undefined") {
    return "negative";
  }

  const outer = document.createElement("div");
  const inner = document.createElement("div");

  outer.dir = "rtl";
  outer.style.width = "4px";
  outer.style.height = "1px";
  outer.style.position = "absolute";
  outer.style.top = "-9999px";
  outer.style.overflow = "scroll";
  inner.style.width = "8px";
  inner.style.height = "1px";
  outer.appendChild(inner);
  document.body.appendChild(outer);

  if (outer.scrollLeft > 0) {
    cachedRtlScrollType = "default";
  } else {
    outer.scrollLeft = 1;
    cachedRtlScrollType = outer.scrollLeft === 0 ? "negative" : "reverse";
  }

  document.body.removeChild(outer);
  return cachedRtlScrollType;
}

function getNormalizedScrollLeft(element: HTMLDivElement, isRtl: boolean) {
  if (!isRtl) {
    return element.scrollLeft;
  }

  const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0);
  switch (getRtlScrollType()) {
    case "negative":
      return maxScrollLeft + element.scrollLeft;
    case "reverse":
      return maxScrollLeft - element.scrollLeft;
    default:
      return element.scrollLeft;
  }
}

function setNormalizedScrollLeft(
  element: HTMLDivElement,
  normalizedScrollLeft: number,
  isRtl: boolean
) {
  if (!isRtl) {
    element.scrollTo({ left: normalizedScrollLeft, behavior: "smooth" });
    return;
  }

  const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0);
  let rawScrollLeft = normalizedScrollLeft;

  switch (getRtlScrollType()) {
    case "negative":
      rawScrollLeft = normalizedScrollLeft - maxScrollLeft;
      break;
    case "reverse":
      rawScrollLeft = maxScrollLeft - normalizedScrollLeft;
      break;
    default:
      rawScrollLeft = normalizedScrollLeft;
      break;
  }

  element.scrollTo({ left: rawScrollLeft, behavior: "smooth" });
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
  containerStyle,
  contentClassName = "",
  buttonClassName = "",
  step,
}: HorizontalScrollRowProps) {
  const { isRtl } = useAppLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      const maxScroll = Math.max(
        container.scrollWidth - container.clientWidth,
        0
      );
      const normalizedLeft = getNormalizedScrollLeft(container, isRtl);
      const logicalPosition = isRtl
        ? maxScroll - normalizedLeft
        : normalizedLeft;
      const remaining = maxScroll - logicalPosition;
      setCanScrollLeft(logicalPosition > 8);
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
  }, [children, isRtl]);

  const handleScrollBackward = () => {
    const container = containerRef.current;
    if (!container) return;

    const maxScroll = Math.max(
      container.scrollWidth - container.clientWidth,
      0
    );
    const normalizedLeft = getNormalizedScrollLeft(container, isRtl);
    const logicalPosition = isRtl ? maxScroll - normalizedLeft : normalizedLeft;
    const nextStep = step ?? Math.max(container.clientWidth * 0.85, 180);
    const distance = Math.min(logicalPosition, nextStep);
    if (distance <= 0) return;

    const nextLogicalPosition = Math.max(logicalPosition - distance, 0);
    const nextNormalizedLeft = isRtl
      ? maxScroll - nextLogicalPosition
      : nextLogicalPosition;

    setNormalizedScrollLeft(container, nextNormalizedLeft, isRtl);
  };

  const handleScrollForward = () => {
    const container = containerRef.current;
    if (!container) return;

    const maxScroll = Math.max(
      container.scrollWidth - container.clientWidth,
      0
    );
    const normalizedLeft = getNormalizedScrollLeft(container, isRtl);
    const logicalPosition = isRtl ? maxScroll - normalizedLeft : normalizedLeft;
    const remaining = maxScroll - logicalPosition;
    if (remaining <= 0) return;

    const nextStep = step ?? Math.max(container.clientWidth * 0.85, 180);
    const distance = remaining <= nextStep * 1.2 ? remaining : nextStep;
    const nextLogicalPosition = Math.min(logicalPosition + distance, maxScroll);
    const nextNormalizedLeft = isRtl
      ? maxScroll - nextLogicalPosition
      : nextLogicalPosition;

    setNormalizedScrollLeft(container, nextNormalizedLeft, isRtl);
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={containerStyle}
        className={`overflow-x-auto hide-scrollbar ${containerClassName}`.trim()}
      >
        <div className={contentClassName}>{children}</div>
      </div>

      {canScrollLeft ? (
        <button
          type="button"
          onClick={handleScrollBackward}
          className={`theme-overlay theme-shadow-strong absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border text-[color:var(--foreground)] backdrop-blur-sm transition hover:scale-[1.03] hover:bg-[color:color-mix(in_srgb,var(--surface-overlay)_92%,var(--foreground)_5%)] ${
            isRtl ? "right-0" : "left-0"
          } ${buttonClassName}`.trim()}
          aria-label={
            isRtl ? "Scroll row to the right" : "Scroll row to the left"
          }
        >
          <ChevronDownGlyph
            className={`h-4 w-4 ${isRtl ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          onClick={handleScrollForward}
          className={`theme-overlay theme-shadow-strong absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border text-[color:var(--foreground)] backdrop-blur-sm transition hover:scale-[1.03] hover:bg-[color:color-mix(in_srgb,var(--surface-overlay)_92%,var(--foreground)_5%)] ${
            isRtl ? "left-0" : "right-0"
          } ${buttonClassName}`.trim()}
          aria-label={
            isRtl ? "Scroll row to the left" : "Scroll row to the right"
          }
        >
          <ChevronDownGlyph
            className={`h-4 w-4 ${isRtl ? "rotate-90" : "-rotate-90"}`}
          />
        </button>
      ) : null}
    </div>
  );
}
