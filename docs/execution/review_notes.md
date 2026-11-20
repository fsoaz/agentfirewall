# v0.1 plan review

| Review point | Implemented behavior |
| --- | --- |
| Grant semantics | The server copies exact fixture permissions into a private per-tool snapshot. Missing permissions fail closed. |
| Dispatch lifecycle | The gateway records its decision before dispatch. An adapter exception preserves the allow decision and records failed execution. |
| Run isolation | Server-generated IDs identify separate grants, event sequences, adapter counts, and sinks. |
| Warning provenance | The fixture signal references a source span and its read decision. Authorization works independently of the signal. |
| Evidence contract | The v1 report contains ordered events, adapter effects, and invariant results. The dashboard download matches the API report. |

The review scoped v0.1 to independent private-read and destination denials. An end-to-end exfiltration evaluation remains outside the release. See the [verification results](test_evidence.md).
