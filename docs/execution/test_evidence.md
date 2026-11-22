# Verification results

Local checks ran with Node.js 22.23.1 and Playwright Chromium.

| Check | Result |
| --- | --- |
| `npm test` | TypeScript passed and all 15 Node tests passed. |
| `npm run test:browser` | Both dashboard flows and JSON downloads passed. The downloads matched the API responses, the canary was absent from the downloads and rendered page, and the mobile viewport had no horizontal overflow. |
| `npm start` | The dashboard server bound to loopback. Both replay requests returned HTTP 200, and the application log contained only startup output during the smoke test. |

| Observed effect | Benign replay | Suspicious replay |
| --- | ---: | ---: |
| Document adapter entries | 1 | 1 |
| Private-record adapter entries | 0 | 0 |
| Publish adapter entries | 1 | 0 |
| Sink writes | 1 | 0 |

The tests verified zero dispatch for every denial reason. A separately authorized private read returned the synthetic canary. Removing the fixture warning preserved authorization decisions and adapter effects. Interleaved calls and concurrent replays retained separate grants, event sequences, and sink activity. Adapter exceptions preserved the original allow decision and recorded a failed execution.

## Vercel entry point

On November 22, 2026, the production homepage returned `500 FUNCTION_INVOCATION_FAILED`. The deployment build had succeeded, but the runtime rejected the entry point because its default export was missing. Commit `61ccd37` added the default HTTP server export.

| Check | Result |
| --- | --- |
| `vercel build --prod --standalone` with Vercel CLI 66.2.0 | Built the function with the dashboard HTML, CSS, and JavaScript. Both Chromium replay flows passed against the packaged server, including the download checks. |
| Production smoke test on `61ccd37` | `/`, `/style.css`, and `/app.js` returned HTTP 200 with the expected content types. `POST /api/replays` returned HTTP 200 and a schema v1 report with all four invariants passing for each scenario. [Production deployment](https://vercel.com/francisco-soares-projects-14324a04/agentfirewall/Fr8ViQA14GLffs13w5pRcbRubMC8). |
