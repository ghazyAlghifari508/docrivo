import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores([
    ".output/**",
    "build/**",
    "coverage/**",
    "drizzle/**",
    "var/**",
    "graphify-out/**",
  ]),
]);

export default eslintConfig;
