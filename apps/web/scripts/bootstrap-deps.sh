#!/usr/bin/env bash
# Resolves the dependency set to exact versions and writes package.json + package-lock.json.
# Runs in CI only (the Claude sandbox has no npm access). Re-run it to add packages: edit the lists below.
set -euo pipefail
cd "$(dirname "$0")/.."
DEPS=(
  next@16.4 react@latest react-dom@latest
  zod@latest @t3-oss/env-nextjs@latest
  clsx@latest tailwind-merge@latest class-variance-authority@latest lucide-react@latest
)
DEV=(
  typescript@6 @types/node@22 @types/react@latest @types/react-dom@latest
  tailwindcss@latest @tailwindcss/postcss@latest
  eslint@9 eslint-config-next@16.4 prettier@latest prettier-plugin-tailwindcss@latest
  vitest@latest @vitejs/plugin-react@latest vite-tsconfig-paths@latest jsdom@latest
  @testing-library/react@latest @testing-library/dom@latest @testing-library/jest-dom@latest
  @playwright/test@latest
)
npm install --save-exact "${DEPS[@]}"
npm install --save-exact --save-dev "${DEV[@]}"
