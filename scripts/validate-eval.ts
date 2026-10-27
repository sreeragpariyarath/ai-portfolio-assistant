import { resolve } from "node:path";
import {
  BEHAVIORS,
  EVAL_FILE,
  RECORDS_FILE,
  RECORD_TYPES,
  VISIBILITIES,
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

export function validateEvalData(corpusInput: unknown, evalInput: unknown): string[] {
  const errors: string[] = [];
  const report: Report = (message) => {
    errors.push(message);
  };

  const recordsById = new Map<string, Obj>();
  if (isObj(corpusInput)) validateCorpus(corpusInput, recordsById, report);
  else report("corpus: must be a JSON object");

  if (isObj(evalInput)) validateEval(evalInput, recordsById, report);
  else report("evalSet: must be a JSON object");

  return errors;
}

function validateCorpus(corpus: Obj, recordsById: Map<string, Obj>, report: Report): void {
  if (!isText(corpus.datasetId)) report("corpus.datasetId: required string");
  if (corpus.isSynthetic !== true) report("corpus.isSynthetic: must be true");
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
    if (record.isSynthetic !== true) report(`${label}: isSynthetic must be true`);
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

function validateEval(evalSet: Obj, recordsById: Map<string, Obj>, report: Report): void {
  if (!isText(evalSet.datasetId)) report("evalSet.datasetId: required string");
  if (typeof evalSet.version !== "number") report("evalSet.version: required number");
  if (evalSet.isSynthetic !== true) report("evalSet.isSynthetic: must be true");
  if (evalSet.corpus !== RECORDS_FILE) report(`evalSet.corpus: must be "${RECORDS_FILE}"`);

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

    if (!isText(entry.id) || !/^E\d{3}$/.test(entry.id)) report(`${label}: id must look like E001`);
    else if (casesById.has(entry.id)) report(`${label}: duplicate case id`);
    else casesById.set(entry.id, entry);

    if (!isText(entry.category)) report(`${label}: category is required`);
    if (!isText(entry.question)) report(`${label}: question is required`);
    if (entry.split !== "development") report(`${label}: split must be "development"`);
    if (entry.isSynthetic !== true) report(`${label}: isSynthetic must be true`);
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
    if (entry.expectedBehavior === "refuse" && evidence.length > 0) {
      report(`${label}: refuse cases must not expect evidence`);
    }

    // forbiddenClaims may name secret values; nothing else in a case may.
    if (leaksSecret([String(entry.question), ...facts].join(" "))) {
      report(`${label}: question or requiredFacts contains a phone-number or salary-like value`);
    }
  });

  validatePinnedFixes(casesById, report);
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
  try {
    corpus = loadJson(RECORDS_FILE);
    evalSet = loadJson(EVAL_FILE);
  } catch (error) {
    console.error(`Cannot read evaluation data: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const errors = validateEvalData(corpus, evalSet);
  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s):`);
    for (const message of errors) console.error(`  - ${message}`);
    return 1;
  }

  const records = (corpus as { records: unknown[] }).records.length;
  const cases = (evalSet as { cases: unknown[] }).cases.length;
  console.log(`ok: ${records} records, ${cases} cases`);
  return 0;
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) {
  process.exitCode = main();
}
