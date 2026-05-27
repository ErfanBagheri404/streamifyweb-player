import React from "react";

export const SkeletonItem: React.FC = () => (
  <div className="flex items-center py-2.5 animate-pulse">
    <div className="w-16 h-16 rounded-xl bg-neutral-700 mr-3" />
    <div className="flex-1">
      <div className="w-full h-4 bg-neutral-700 rounded-lg mb-1.5" />
      <div className="w-3/4 h-3 bg-neutral-800 rounded-md" />
    </div>
  </div>
);