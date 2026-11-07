// Helpers for the public record pages that citations link to. Pure: the records are passed in, so
// the root tests can run this without importing the JSON bundle.

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

export function recordPath(id: string): string {
  return `/records/${encodeURIComponent(id)}`;
}

export function findRecord(records: readonly PublicRecord[], id: string): PublicRecord | undefined {
  return records.find((record) => record.id === id);
}

const TYPE_LABELS: Record<string, string> = {
  profile: "Profile",
  project: "Project",
  contribution: "Contribution",
  decision: "Decision",
};

export function recordTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

const STATUS_LABELS: Record<string, string> = {
  "reviewed-fixture": "Reviewed",
  "synthetic-fixture": "Example",
  "verified-public": "Verified on a public page",
  "verified-document": "Verified in a document",
  "owner-stated": "Stated by the owner",
  unverified: "Unverified",
};

export function verificationLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

// Dates in the data are YYYY-MM-DD; shown as "3 Oct 2026" without time-zone surprises.
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) return date;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  return month === undefined ? date : `${Number(match[3])} ${month} ${match[1]}`;
}

export interface SourceChip {
  id: string;
  // Its number among the answer's citations, the same number the inline marker shows.
  n: number;
  title: string;
}

// The sources shown under an answer: readable record titles, at most `max`. None for a reply that is not backed
// by records (small talk, "I don't know", a refusal), and a cited id the site does not ship is skipped.
export function sourceChips(
  citations: readonly string[],
  records: readonly { id: string; title: string }[],
  behavior: string | undefined,
  max = 3,
): SourceChip[] {
  if (behavior === "abstain" || behavior === "refuse" || behavior === "offtopic") return [];
  const chips: SourceChip[] = [];
  citations.forEach((id, index) => {
    const record = records.find((candidate) => candidate.id === id);
    if (record !== undefined && chips.length < max) chips.push({ id, n: index + 1, title: record.title });
  });
  return chips;
}
