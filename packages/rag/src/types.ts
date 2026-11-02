export const RECORD_TYPES = ["profile", "project", "contribution", "decision"] as const;
export const VISIBILITIES = ["public", "private"] as const;

export interface KnowledgeRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  verificationStatus: string;
  isSynthetic: boolean;
  // Where the record came from. Real (non-synthetic) records must name one of REAL_SOURCE_KINDS.
  source?: { kind: string; ref: string };
  visibility: string;
  createdAt: string;
  updatedAt: string;
  validFrom?: string;
  validUntil?: string;
  projectId?: string;
}
