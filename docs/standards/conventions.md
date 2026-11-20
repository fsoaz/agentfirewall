# Project conventions

- Use TypeScript ESM in `src/` and Node's built-in test runner in `test/`. The dashboard uses plain HTML, CSS, and JavaScript in `web/`.
- Validate inputs at the HTTP and gateway boundaries. Keep grant creation and adapter dispatch server-side. Resolve resource metadata before reading any protected contents.
- Record the authorization decision before dispatch and the execution outcome afterward. Count adapter entries and writes where they occur.
- Keep fixtures synthetic. Use resolved fixture IDs and fixed reason codes in public reports. Keep tool arguments, protected contents, sink payloads, and raw errors out of public reports. Render document excerpts as text.
- Update the [API contract](api_rules.md) and [verification evidence](../execution/test_evidence.md) when a change affects the report or a documented demo outcome.
