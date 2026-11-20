# Verification results

Verified with Node.js 22.23.1 and Playwright Chromium. The documentation update reran both automated checks.

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
