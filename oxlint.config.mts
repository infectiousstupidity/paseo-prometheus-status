import unicorn from "eslint-plugin-unicorn";
import { defineConfig } from "oxlint";

const unicornRecommendedRules = Object.fromEntries(
  Object.entries(unicorn.configs.recommended.rules ?? {}).map(
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
  rules: {
    ...unicornRecommendedRules,
    // Explicit null is part of the normalized RPC/upstream data model.
    "unicorn-js/no-null": "off",
    // Prometheus is commonly served over plain http on the local network.
    "unicorn-js/prefer-https": "off",
    // The server intentionally keeps a small module-level request/status cache.
    "unicorn-js/no-top-level-assignment-in-function": "off",
    // Named node:path imports keep the filesystem helpers explicit at call sites.
    "unicorn-js/import-style": "off",
    // Iterator#toArray is newer than this plugin's ES2023 type target.
    "unicorn-js/prefer-iterator-to-array": "off",
  },
});
