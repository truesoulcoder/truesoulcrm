// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defineConfig, globalIgnores } = require("eslint/config");
const { fixupConfigRules, fixupPluginRules } = require("@eslint/compat");
const react = require("eslint-plugin-react");
const unusedImports = require("eslint-plugin-unused-imports");
const _import = require("eslint-plugin-import");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const jsxA11Y = require("eslint-plugin-jsx-a11y");
const prettier = require("eslint-plugin-prettier");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([globalIgnores([
    ".now/*",
    "**/*.css",
    "**/.changeset",
    "**/dist",
    "esm/*",
    "public/*",
    "tests/*",
    "scripts/*",
    "**/*.config.js",
    "**/.DS_Store",
    "**/node_modules",
    "**/coverage",
    "**/.next",
    "**/build",
    "!**/.commitlintrc.cjs",
    "!**/.lintstagedrc.cjs",
    "!**/jest.config.js",
    "!**/plopfile.js",
    "!**/react-shim.js",
    "!**/tsup.config.ts",
]), {
    extends: fixupConfigRules(compat.extends(
        "plugin:react/recommended",
        "plugin:prettier/recommended",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
        "plugin:@next/next/recommended",
    )),

    plugins: {
        react: fixupPluginRules(react),
        "unused-imports": unusedImports,
        import: fixupPluginRules(_import),
        "@typescript-eslint": typescriptEslint,
        "jsx-a11y": fixupPluginRules(jsxA11Y),
        prettier: fixupPluginRules(prettier),
    },

    languageOptions: {
        globals: {
            ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, "off"])),
            ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 12,
        sourceType: "module",

        parserOptions: {
            ecmaFeatures: {
                jsx: true,
            },
        },
    },

    settings: {
        react: {
            version: "detect",
        },
    },

    files: ["**/*.ts", "**/*.tsx"],

    rules: {
        "no-console": "warn",
        "react/prop-types": "off",
        "react/jsx-uses-react": "off",
        "react/react-in-jsx-scope": "off",
        "react-hooks/exhaustive-deps": "off",
        "jsx-a11y/click-events-have-key-events": "warn",
        "jsx-a11y/interactive-supports-focus": "warn",
        "prettier/prettier": "warn",
        "no-unused-vars": "off",
        "unused-imports/no-unused-vars": "off",
        "unused-imports/no-unused-imports": "warn",

        "@typescript-eslint/no-unused-vars": ["warn", {
            args: "after-used",
            ignoreRestSiblings: false,
            argsIgnorePattern: "^_.*?$",
        }],

        "import/order": ["warn", {
            groups: [
                "type",
                "builtin",
                "object",
                "external",
                "internal",
                "parent",
                "sibling",
                "index",
            ],

            pathGroups: [{
                pattern: "~/**",
                group: "external",
                position: "after",
            }],

            "newlines-between": "always",
        }],

        "react/self-closing-comp": "warn",

        "react/jsx-sort-props": ["warn", {
            callbacksLast: true,
            shorthandFirst: true,
            noSortAlphabetically: false,
            reservedFirst: true,
        }],

        "padding-line-between-statements": ["warn", {
            blankLine: "always",
            prev: "*",
            next: "return",
        }, {
            blankLine: "always",
            prev: ["const", "let", "var"],
            next: "*",
        }, {
            blankLine: "any",
            prev: ["const", "let", "var"],
            next: ["const", "let", "var"],
        }],
    },
}]);