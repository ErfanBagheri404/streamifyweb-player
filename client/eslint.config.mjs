import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Pre-existing patterns across the codebase — warn until refactored
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default config;
