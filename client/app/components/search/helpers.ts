export const formatDuration = (seconds: number, _source?: string): string => {
  if (seconds === 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

export const shortCount = (num: number | string): string => {
  const n = typeof num === "string" ? parseInt(num, 10) : num;
  if (Number.isNaN(n)) return "";
  if (n < 1000) return n.toString();
  if (n < 1000000) return `${(n / 1000).toFixed(1).replace(".0", "")}K`;
  if (n < 1000000000) return `${(n / 1000000).toFixed(1).replace(".0", "")}M`;
  return `${(n / 1000000000).toFixed(1).replace(".0", "")}B`;
};