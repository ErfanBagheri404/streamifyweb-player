import React from "react";

export const SkeletonItem: React.FC = () => (
  <div className="animate-float-pulse flex items-center py-2.5">
    <div className="loading-skeleton mr-3 h-16 w-16 rounded-xl" />
    <div className="flex-1">
      <div className="loading-skeleton mb-1.5 h-4 w-full rounded-lg" />
      <div className="loading-skeleton h-3 w-3/4 rounded-md" />
    </div>
  </div>
);
