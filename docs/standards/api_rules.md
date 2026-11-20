# API contract

## Local HTTP

`POST /api/replays` accepts `application/json` with a body of up to 1,024 bytes. The JSON object has exactly one field, `scenarioId`, set to `"benign"` or `"suspicious"`.

```json
{ "scenarioId": "suspicious" }
```

HTTP 200 returns a [v1 report](../context/architecture.md#public-report-v1), including any tool denials. The dashboard at `GET /` downloads the report it received. Grant creation and individual tool calls are internal interfaces.

| Status | Error code | Condition |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Body cannot be parsed as JSON |
| 400 | `INVALID_SCENARIO` | Body shape or scenario ID is invalid |
| 404 | `NOT_FOUND` | No handler matches the path and method |
| 405 | `METHOD_NOT_ALLOWED` | A method other than POST was used on the replay endpoint |
| 413 | `REQUEST_TOO_LARGE` | Body exceeds 1,024 bytes |
| 415 | `JSON_REQUIRED` | Request media type is unsupported |
| 500 | `REPLAY_UNAVAILABLE` | Unexpected server error before response headers were sent |

Errors use `{ "error": "CODE" }`. The 405 response includes `Allow: POST`.

## Tool decisions

`invoke(runId, input: unknown)` validates an exact call shape before consulting the run grant.

| Tool | Arguments |
| --- | --- |
| `documents.read` | `documentId: string` |
| `records.read` | `recordId: string` |
| `publish` | `destinationId: string`, `content: string` |

`GRANT_MATCH` yields an allow decision and an execution outcome of `succeeded` or `failed`. `INVALID_ARGUMENTS`, `UNKNOWN_TOOL`, `MISSING_GRANT`, `RESOURCE_NOT_FOUND`, `RESOURCE_NOT_GRANTED`, and `POLICY_ERROR` yield deny and `not_dispatched`. An unknown run ID yields no journal entry. See [contracts.ts](../../src/contracts.ts) for the TypeScript shapes.
