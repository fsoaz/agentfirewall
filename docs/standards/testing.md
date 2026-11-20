# Testing

Run `npm test` after installing dependencies. For browser checks, install Chromium once with `npx playwright install chromium`, then run `npm run test:browser`. Automated server checks use ephemeral loopback ports.

| Layer | Coverage |
| --- | --- |
| Gateway | Zero adapter entries for denials, authorized retrieval of the canary, decision recording before dispatch, and failed execution after an adapter exception |
| Replay | Both scenarios, marker provenance, warning independence, and concurrent run isolation |
| HTTP | Report shape, scenario validation, request size limit, malformed JSON, method handling, and absence of the canary |
| Browser | Rendered counts, highlighted source span, downloads matching the API response, and mobile layout |

For a launch smoke test, run `npm start` and follow the [demo walkthrough](../../README.md#walkthrough). Record observed outcomes in [test evidence](../execution/test_evidence.md).
