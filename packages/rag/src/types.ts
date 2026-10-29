export const RECORD_TYPES = ["profile", "project", "contribution", "decision"] as const;
export const VISIBILITIES = ["public", "private"] as const;

export interface KnowledgeRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  verificationStatus: string;
  isSynthetic: boolean;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  validFrom?: string;
  validUntil?: string;
  projectId?: string;
}
