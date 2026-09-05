import unicorn from "eslint-plugin-unicorn";
import { defineConfig } from "oxlint";

const unicornRecommendedRules = Object.fromEntries(
  Object.entries(unicorn.configs.recommended.rules).map(
    ([ruleName, ruleConfig]) => [
      ruleName.startsWith("unicorn/")
        ? ruleName.replace(/^unicorn\//, "unicorn-js/")
        : ruleName,
      ruleConfig,
    ],
  ),
);

export default defineConfig({
  plugins: ["eslint", "typescript", "oxc"],
  jsPlugins: [
    {
      name: "unicorn-js",
      specifier: "eslint-plugin-unicorn",
    },
  ],
  ignorePatterns: ["dist/**", "coverage/**", ".test-dist/**"],
  rules: unicornRecommendedRules,
});
