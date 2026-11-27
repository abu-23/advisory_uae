import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["src/generated/**", ".next/**", "node_modules/**", "coverage/**", "prototype/**", "next-env.d.ts"],
  },
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "react/no-danger": "error",
    },
  },
];

export default config;
