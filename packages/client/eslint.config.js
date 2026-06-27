import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // shadcn-generated UI primitives and theme helpers legitimately co-export
    // variant helpers (buttonVariants, badgeVariants) alongside components.
    // The ThemeProvider co-exports its Theme type and useTheme hook.
    // Relaxing react-refresh here is intentional and safe — these are not
    // hot-reloadable boundaries but library-style files.
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/components/theme/**/*.{ts,tsx}",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
