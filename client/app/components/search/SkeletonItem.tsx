import React from "react";
import { useAppLanguage } from "../../hooks/useAppLanguage";

export const SkeletonItem: React.FC = () => {
  const { isRtl } = useAppLanguage();

  return (
    <div
      className={`animate-float-pulse flex items-center gap-3 py-2.5 ${
        isRtl ? "flex-row-reverse" : ""
      }`}
    >
      <div className="loading-skeleton h-16 w-16 rounded-xl" />
      <div className="flex-1">
        <div className="loading-skeleton mb-1.5 h-4 w-full rounded-lg" />
        <div className="loading-skeleton h-3 w-3/4 rounded-md" />
      </div>
    </div>
  );
};
