import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Ignore generated files
    ignores: [
      "lib/generated/**/*",
      "**/prisma/wasm.js",
      "node_modules/**/*",
      ".next/**/*",
      "out/**/*",
    ],
  },
];

export default eslintConfig;