import type { KnowledgeRecord } from "./types.ts";

// Fixed project namespace for point IDs. Never change it: every stored point ID derives from it.
export const POINT_ID_NAMESPACE = "5d0c2a61-7b3e-4f18-9a54-c1e8f6b2d907";

export interface PointPayload {
  record_id: string;
  type: string;
  title: string;
  content: string;
  visibility: string;
  verification_status: string;
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
  project_id?: string;
  valid_from?: string;
  valid_until?: string;
  content_hash: string;
  embedding_model: string;
  embedding_dimensions: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(algorithm: "SHA-1" | "SHA-256", data: Uint8Array): Promise<Uint8Array> {
  // Bare `crypto` (WebCrypto) exists in Node 24 and Workers; Workers' types declare it as a global, not on globalThis.
  return new Uint8Array(await crypto.subtle.digest(algorithm, data as BufferSource));
}

export function recordText(record: KnowledgeRecord): string {
  return `${record.title}\n\n${record.content}`;
}

// Covers model, dimensions and text, so changing any of them re-embeds the record.
export async function contentHash(record: KnowledgeRecord, model: string, dims: number): Promise<string> {
  const input = new TextEncoder().encode(`${model}\n${dims}\n${recordText(record)}`);
  return toHex(await digest("SHA-256", input));
}

export function validateVector(values: unknown, dims: number): number[] {
  if (
    !Array.isArray(values) ||
    values.length !== dims ||
    !values.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    throw new Error(`Expected ${dims} finite embedding values.`);
  }
  return values as number[];
}

// Defense in depth: nothing non-public or non-synthetic is ever embedded or stored.
// The message names the record id only, never its content.
export function assertIngestable(record: KnowledgeRecord): void {
  if (record.visibility !== "public" || !record.isSynthetic) {
    throw new Error(`Record "${record.id}" failed the privacy check.`);
  }
}

// RFC 4122 version 5 (SHA-1, name-based) UUID.
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const namespaceBytes = new Uint8Array(namespace.replaceAll("-", "").match(/../g)!.map((pair) => parseInt(pair, 16)));
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);

  const hash = (await digest("SHA-1", input)).slice(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;

  const hex = toHex(hash);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Qdrant accepts only unsigned integers or UUIDs as point ids, so record ids map to a stable UUID.
export function pointId(recordId: string): Promise<string> {
  return uuidV5(recordId, POINT_ID_NAMESPACE);
}

export function toPayload(record: KnowledgeRecord, hash: string, model: string, dims: number): PointPayload {
  const payload: PointPayload = {
    record_id: record.id,
    type: record.type,
    title: record.title,
    content: record.content,
    visibility: record.visibility,
    verification_status: record.verificationStatus,
    is_synthetic: record.isSynthetic,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    content_hash: hash,
    embedding_model: model,
    embedding_dimensions: dims,
  };
  if (record.projectId !== undefined) payload.project_id = record.projectId;
  if (record.validFrom !== undefined) payload.valid_from = record.validFrom;
  if (record.validUntil !== undefined) payload.valid_until = record.validUntil;
  return payload;
}
