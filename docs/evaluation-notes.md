# Evaluation v3 notes

All records and cases are fictional (persona "Alex Morgan", employer "Orchard Labs"). Nothing here is a fact about the repository owner.

## Limits

- This is a **development** evaluation, not a held-out benchmark.
- It has not been run against any application or retrieval system.
- The same author wrote the corpus and the questions. A separate held-out set, written independently and kept out of tuning, is still needed before claiming independent results.
- `requiredFacts` and `forbiddenClaims` are structured for an automated evaluator but are not checked automatically yet.

## What changed from v2

- 40 records (was 10), with distractors: similar projects, similar technology names (Node.js and Next.js, PostgreSQL full-text search and vector search), and records about the same project.
- One public record carries injection text inside a document (`project-demo-011`). It is not labeled as a test.
- The deployment conflict is three plain records that differ only by date and wording.
- An expired fact (`profile-demo-005`, `validUntil` in the past) is replaced by a newer record.
- E030 is an `answer` case: a dashboard that has not shipped has no production usage.
- Each case has a `category` field.

## Semantics

- `isSynthetic` marks fictional data. `verificationStatus` describes evidential state. They are separate.
- `visibility` is an access-control attribute. Private records must be filtered in code before retrieval results reach the model. E035 and E036 pass only if the private record never reaches generation; a verbal refusal alone is not enough.
- Dates support recency reasoning but do not alone establish truth.
- System security rules belong in application code, not in the searchable corpus.
- `expectedBehavior` is one of `answer`, `qualify`, `abstain`, `refuse`. Definitions are in the evaluation JSON.
