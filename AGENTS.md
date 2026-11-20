# Repository Guidelines

## Project Structure

- `src/` contains the TypeScript gateway, tool and report contracts, synthetic fixtures, scripted replays, and local HTTP server.
- `web/` contains the dashboard HTML, CSS, and JavaScript. `test/` contains Node tests, and `checks/browser.mjs` exercises the dashboard with Playwright.
- `docs/` describes the product, architecture, API, and verification evidence. The root `README.md` includes the demo walkthrough.

## Development Commands

Use Node.js 22.18 or later. Node runs the TypeScript entry point directly.

- `npm install` installs development dependencies.
- `npm start` serves the dashboard at `http://127.0.0.1:3000`.
- `npm run check` type-checks the TypeScript without emitting files.
- `npm test` runs the type check and Node test suite.
- `npx playwright install chromium` installs the browser used by `npm run test:browser`.

## Coding Style and Gateway Boundaries

Follow the existing two-space indentation, double-quoted strings, and semicolons in TypeScript and JavaScript. Use ESM, explicit `.ts` extensions for local TypeScript imports, camelCase for functions and variables, and PascalCase for classes and types. The project uses strict TypeScript settings.

Keep `invoke` as the sole tool dispatch entry point. Validate tool arguments and check server-owned grants before dispatch. Record authorization and execution separately. Use synthetic fixtures and keep protected values, raw errors, and tool payloads out of public reports.

## Testing

Name Node tests `*.test.ts` and use descriptive behavior-based names with `node:test` and `node:assert/strict`. For gateway changes, verify both an allowed action and zero adapter calls on denial. For dashboard or report changes, run the browser check to compare the displayed results and JSON download with the API response.

## Commits and Pull Requests

Follow recent history with short, imperative subjects such as `feat: add replay scenario` or `docs: update report contract`. In pull requests, describe the behavior change, include verification commands and outcomes, link relevant issues, and attach screenshots for visible dashboard changes.
