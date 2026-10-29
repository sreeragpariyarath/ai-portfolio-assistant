import { assertIngestable } from "@portfolio/rag";
import type { Corpus, KnowledgeRecord } from "./eval-data.ts";

export const PUBLIC_CORPUS_FILE = "apps/api/src/generated/public-corpus.json";

// What the Worker needs to search and cite a record. `visibility` and `isSynthetic` are left out on purpose:
// everything in the bundle is public and synthetic by construction.
export interface PublicRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  verificationStatus: string;
  createdAt: string;
  updatedAt: string;
  validFrom?: string;
  validUntil?: string;
  projectId?: string;
}

export interface PublicCorpus {
  datasetId: string;
  records: PublicRecord[];
}

export function toPublicRecord(record: KnowledgeRecord): PublicRecord {
  // Same privacy guard as ingestion: throws for anything that is not public and synthetic.
  assertIngestable(record);

  const publicRecord: PublicRecord = {
    id: record.id,
    type: record.type,
    title: record.title,
    content: record.content,
    verificationStatus: record.verificationStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (record.validFrom !== undefined) publicRecord.validFrom = record.validFrom;
  if (record.validUntil !== undefined) publicRecord.validUntil = record.validUntil;
  if (record.projectId !== undefined) publicRecord.projectId = record.projectId;
  return publicRecord;
}

// Public records only, sorted by id, so the output does not depend on the order of the source file.
export function buildPublicCorpus(corpus: Corpus): PublicCorpus {
  const records = corpus.records
    .filter((record) => record.visibility === "public")
    .map(toPublicRecord)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { datasetId: corpus.datasetId, records };
}

export function serializePublicCorpus(corpus: PublicCorpus): string {
  return `${JSON.stringify(corpus, null, 2)}\n`;
}

// Git may check files out with CRLF on Windows; compare content, not line endings.
export function normalizeNewlines(text: string): string {
  return text.replaceAll("\r\n", "\n");
}
