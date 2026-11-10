import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { REAL_SOURCE_KINDS } from "@portfolio/rag";
import {
  BEHAVIORS,
  EVAL_FILE,
  HELDOUT_EVAL_FILE,
  PORTFOLIO_RECORDS_FILE,
  RECORDS_FILE,
  RECORD_TYPES,
  SCORING_MODES,
  SYNTHETIC_RECORDS_FILE,
  VISIBILITIES,
  REPO_ROOT,
  loadJson,
} from "./lib/eval-data.ts";

type Obj = Record<string, unknown>;
type Report = (message: string) => void;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /\+?\d{1,3}[-. ]\d{3}[-. ]\d{3}[-. ]\d{4}/;
const SALARY = /\b\d{2,3},\d{3}\b/;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function leaksSecret(text: string): boolean {
  return PHONE.test(text) || SALARY.test(text);
}

// A run of 10 or more digits (a phone number written without separators), ignoring the public App Store
// listing id such as "id1234567890".
function hasLongNumber(text: string): boolean {
  return /\d{10,}/.test(text.replace(/id\d{10}/g, ""));
}

// The synthetic files are the fictional test fixtures; anything else is the owner's real data (D-029).
const PINNED_FIXTURE_DATASET = "retrieval-eval-v3";

export function validateEvalData(corpusInput: unknown, evalInput: unknown): string[] {
  const errors: string[] = [];
  const report: Report = (message) => {
    errors.push(message);
  };

  const recordsById = new Map<string, Obj>();
  if (isObj(corpusInput)) validateCorpus(corpusInput, recordsById, report);
  else report("corpus: must be a JSON object");

  const synthetic = isObj(corpusInput) && corpusInput.isSynthetic === true;
  if (isObj(evalInput)) validateEval(evalInput, recordsById, report, synthetic);
  else report("evalSet: must be a JSON object");

  return errors;
}

function validateCorpus(corpus: Obj, recordsById: Map<string, Obj>, report: Report): void {
  if (!isText(corpus.datasetId)) report("corpus.datasetId: required string");
  if (typeof corpus.isSynthetic !== "boolean") report("corpus.isSynthetic: must be true or false");
  const syntheticCorpus = corpus.isSynthetic === true;
  if (!Array.isArray(corpus.records) || corpus.records.length === 0) {
    report("corpus.records: required non-empty array");
    return;
  }

  const records: Obj[] = [];
  corpus.records.forEach((record: unknown, index) => {
    if (!isObj(record)) {
      report(`records[${index}]: must be an object`);
      return;
    }
    records.push(record);
    const label = isText(record.id) ? record.id : `records[${index}]`;

    if (!isText(record.id)) report(`${label}: id is required`);
    else if (recordsById.has(record.id)) report(`${label}: duplicate record id`);
    else recordsById.set(record.id, record);

    for (const field of ["type", "title", "content", "verificationStatus", "visibility", "createdAt", "updatedAt"]) {
      if (!isText(record[field])) report(`${label}: ${field} is required`);
    }
    // A synthetic corpus is all fiction. A real corpus may hold real records, each naming where it came from,
    // plus clearly fake private test fixtures.
    if (record.isSynthetic !== true) {
      const kind = isObj(record.source) ? record.source.kind : undefined;
      if (syntheticCorpus) report(`${label}: isSynthetic must be true in a synthetic corpus`);
      else if (!(REAL_SOURCE_KINDS as readonly unknown[]).includes(kind)) {
        report(`${label}: a real record needs source.kind to be one of ${REAL_SOURCE_KINDS.join(", ")}`);
      }
    }
    if (!(RECORD_TYPES as readonly unknown[]).includes(record.type)) {
      report(`${label}: type must be one of ${RECORD_TYPES.join(", ")}`);
    }
    if (!(VISIBILITIES as readonly unknown[]).includes(record.visibility)) {
      report(`${label}: visibility must be one of ${VISIBILITIES.join(", ")}`);
    }
    for (const field of ["createdAt", "updatedAt", "validFrom", "validUntil"]) {
      const value = record[field];
      if (value !== undefined && !(typeof value === "string" && DATE.test(value))) {
        report(`${label}: ${field} must be YYYY-MM-DD`);
      }
    }
    if (
      typeof record.validFrom === "string" &&
      typeof record.validUntil === "string" &&
      record.validUntil < record.validFrom
    ) {
      report(`${label}: validUntil is before validFrom`);
    }
    if (record.visibility !== "private" && leaksSecret(`${record.title} ${record.content}`)) {
      report(`${label}: non-private record contains a phone-number or salary-like value`);
    }
    if (record.visibility !== "private" && hasLongNumber(`${record.title} ${record.content}`)) {
      report(`${label}: non-private record contains a run of 10 or more digits`);
    }
  });

  for (const record of records) {
    if (record.projectId === undefined) continue;
    const target = typeof record.projectId === "string" ? recordsById.get(record.projectId) : undefined;
    if (!target || target.type !== "project") {
      report(`${String(record.id)}: projectId must reference an existing project record`);
    }
  }

  if (!records.some((record) => record.visibility === "private")) {
    report("corpus: needs at least one private record to test access filtering");
  }
}

function validateEval(evalSet: Obj, recordsById: Map<string, Obj>, report: Report, syntheticCorpus: boolean): void {
  if (!isText(evalSet.datasetId)) report("evalSet.datasetId: required string");
  if (typeof evalSet.version !== "number") report("evalSet.version: required number");
  if (evalSet.isSynthetic !== syntheticCorpus) report(`evalSet.isSynthetic: must be ${syntheticCorpus} to match the corpus`);
  const corpusFile = syntheticCorpus ? SYNTHETIC_RECORDS_FILE : PORTFOLIO_RECORDS_FILE;
  if (evalSet.corpus !== corpusFile) report(`evalSet.corpus: must be "${corpusFile}"`);

  const declared = evalSet.expectedBehaviorEnum;
  if (
    !isStringArray(declared) ||
    declared.length !== BEHAVIORS.length ||
    !BEHAVIORS.every((behavior) => declared.includes(behavior))
  ) {
    report(`evalSet.expectedBehaviorEnum: must be exactly ${BEHAVIORS.join(", ")}`);
  }

  if (!Array.isArray(evalSet.cases) || evalSet.cases.length === 0) {
    report("evalSet.cases: required non-empty array");
    return;
  }

  const casesById = new Map<string, Obj>();
  evalSet.cases.forEach((entry: unknown, index) => {
    if (!isObj(entry)) {
      report(`cases[${index}]: must be an object`);
      return;
    }
    const label = isText(entry.id) ? entry.id : `cases[${index}]`;

    if (!isText(entry.id) || !/^[EH]\d{3}$/.test(entry.id)) report(`${label}: id must look like E001 (or H001 for held-out cases)`);
    else if (casesById.has(entry.id)) report(`${label}: duplicate case id`);
    else casesById.set(entry.id, entry);

    if (!isText(entry.category)) report(`${label}: category is required`);
    if (!isText(entry.question)) report(`${label}: question is required`);
    if (entry.split !== "development" && entry.split !== "heldout") report(`${label}: split must be "development" or "heldout"`);
    if (entry.split === "heldout" && !/^H/.test(String(entry.id))) report(`${label}: held-out cases use ids like H001`);
    if (entry.isSynthetic !== syntheticCorpus) report(`${label}: isSynthetic must be ${syntheticCorpus}`);
    if (!(BEHAVIORS as readonly unknown[]).includes(entry.expectedBehavior)) {
      report(`${label}: expectedBehavior must be one of ${BEHAVIORS.join(", ")}`);
    }

    const evidence = isStringArray(entry.expectedEvidenceIds) ? entry.expectedEvidenceIds : [];
    const facts = isStringArray(entry.requiredFacts) ? entry.requiredFacts : [];
    if (!isStringArray(entry.expectedEvidenceIds)) report(`${label}: expectedEvidenceIds must be a string array`);
    if (!isStringArray(entry.requiredFacts)) report(`${label}: requiredFacts must be a string array`);
    if (!isStringArray(entry.forbiddenClaims)) report(`${label}: forbiddenClaims must be a string array`);

    if (new Set(evidence).size !== evidence.length) report(`${label}: expectedEvidenceIds has duplicates`);
    for (const id of evidence) {
      const record = recordsById.get(id);
      if (!record) report(`${label}: expectedEvidenceIds references unknown record ${id}`);
      else if (record.visibility === "private") report(`${label}: expectedEvidenceIds includes private record ${id}`);
    }

    if (entry.expectedBehavior === "answer" || entry.expectedBehavior === "qualify") {
      if (evidence.length === 0) report(`${label}: ${entry.expectedBehavior} cases need expectedEvidenceIds`);
      if (facts.length === 0) report(`${label}: ${entry.expectedBehavior} cases need requiredFacts`);
    }
    if (entry.scoring !== undefined && !(SCORING_MODES as readonly unknown[]).includes(entry.scoring)) {
      report(`${label}: scoring must be one of ${SCORING_MODES.join(", ")}`);
    }
    if (entry.scoring === "list" && evidence.length < 2) {
      report(`${label}: list cases need at least two expectedEvidenceIds`);
    }
    if (entry.expectedBehavior === "refuse" && evidence.length > 0) {
      report(`${label}: refuse cases must not expect evidence`);
    }

    // forbiddenClaims may name secret values; nothing else in a case may.
    if (leaksSecret([String(entry.question), ...facts].join(" "))) {
      report(`${label}: question or requiredFacts contains a phone-number or salary-like value`);
    }
  });

  if (evalSet.datasetId === PINNED_FIXTURE_DATASET) validatePinnedFixes(casesById, report);
}

// E024 and E032 were corrected after review; keep those corrections from regressing.
function validatePinnedFixes(casesById: Map<string, Obj>, report: Report): void {
  const e024 = casesById.get("E024");
  if (!e024) report("E024: case is missing");
  else {
    if (e024.question !== "Which recorded project is documented as using Next.js?") {
      report("E024: question changed from the agreed wording");
    }
    if (JSON.stringify(e024.expectedEvidenceIds) !== JSON.stringify(["project-demo-006"])) {
      report("E024: expectedEvidenceIds must be exactly [project-demo-006]");
    }
  }

  const e032 = casesById.get("E032");
  if (!e032) report("E032: case is missing");
  else {
    const evidence = isStringArray(e032.expectedEvidenceIds) ? e032.expectedEvidenceIds : [];
    const facts = isStringArray(e032.requiredFacts) ? e032.requiredFacts : [];
    const forbidden = isStringArray(e032.forbiddenClaims) ? e032.forbiddenClaims : [];

    if (e032.scoring !== "list") report('E032: scoring must be "list"');
    for (const id of ["project-demo-004", "project-demo-011"]) {
      if (evidence.includes(id)) report(`E032: expectedEvidenceIds must not include ${id}`);
    }
    for (const fact of ["log search prototype", "feature flag prototype", "support assistant v2 plan planned"]) {
      if (!facts.includes(fact)) report(`E032: requiredFacts is missing "${fact}"`);
    }
    if (!forbidden.some((claim) => /older note/i.test(claim))) {
      report("E032: forbiddenClaims must block reporting the older deployment note as current");
    }
    if (!forbidden.some((claim) => /scratch notes/i.test(claim))) {
      report("E032: forbiddenClaims must block counting the scratch notes as a project");
    }
  }
}

function main(): number {
  let corpus: unknown;
  let evalSet: unknown;
  let heldout: unknown;
  try {
    corpus = loadJson(RECORDS_FILE);
    evalSet = loadJson(EVAL_FILE);
    heldout = existsSync(resolve(REPO_ROOT, HELDOUT_EVAL_FILE)) ? loadJson(HELDOUT_EVAL_FILE) : undefined;
  } catch (error) {
    console.error(`Cannot read evaluation data: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const errors = validateEvalData(corpus, evalSet);
  if (heldout !== undefined) {
    for (const error of validateEvalData(corpus, heldout)) errors.push(`held-out: ${error}`);
    // A held-out question must not repeat a development question.
    const seen = new Set((evalSet as { cases: { question: string }[] }).cases.map((entry) => entry.question.trim().toLowerCase()));
    for (const entry of (heldout as { cases: { id: string; question: string }[] }).cases) {
      if (seen.has(entry.question.trim().toLowerCase())) errors.push(`held-out: ${entry.id} repeats a development question`);
    }
  }
  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s):`);
    for (const message of errors) console.error(`  - ${message}`);
    return 1;
  }

  const records = (corpus as { records: unknown[] }).records.length;
  const cases = (evalSet as { cases: unknown[] }).cases.length;
  const heldoutCases = heldout === undefined ? 0 : (heldout as { cases: unknown[] }).cases.length;
  console.log(`ok: ${records} records, ${cases} cases, ${heldoutCases} held-out cases`);
  return 0;
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) {
  process.exitCode = main();
}
