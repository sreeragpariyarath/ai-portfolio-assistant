import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import corpus from "@/generated/public-corpus.json";
import { findRecord, formatDate, recordPath, recordTypeLabel, verificationLabel } from "@/features/records/records";
import type { PublicRecord } from "@/features/records/records";
import { SITE } from "@/features/home/site";

// One static page per public record, built from the same public-only bundle the API uses
// (`pnpm corpus:build`). Private records are never in that bundle, so they can never get a page.
const records: readonly PublicRecord[] = corpus.records;

// Only the ids listed here exist; anything else is a 404 (static export, D-020).
export const dynamicParams = false;

export function generateStaticParams() {
  return records.map((record) => ({ id: record.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const record = findRecord(records, id);
  return { title: record === undefined ? `Not found · ${SITE.title}` : `${record.title} · ${SITE.title}` };
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = findRecord(records, id);
  if (record === undefined) notFound();
  const project = record.projectId === undefined ? undefined : findRecord(records, record.projectId);

  return (
    <main className="min-h-dvh bg-white px-4 py-10">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← {SITE.name}
        </Link>

        <p className="mt-8 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-medium text-neutral-700">{recordTypeLabel(record.type)}</span>
          <span>Source record {record.id}</span>
        </p>
        <h1 className="mt-3 text-3xl font-bold text-neutral-950">{record.title}</h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed whitespace-pre-wrap text-neutral-800">{record.content}</p>

        <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-neutral-200 pt-6 text-sm">
          <dt className="text-neutral-500">Status</dt>
          <dd className="text-neutral-800">{verificationLabel(record.verificationStatus)}</dd>
          <dt className="text-neutral-500">Updated</dt>
          <dd className="text-neutral-800">{formatDate(record.updatedAt)}</dd>
          {record.validFrom !== undefined ? (
            <>
              <dt className="text-neutral-500">Valid from</dt>
              <dd className="text-neutral-800">{formatDate(record.validFrom)}</dd>
            </>
          ) : null}
          {record.validUntil !== undefined ? (
            <>
              <dt className="text-neutral-500">Valid until</dt>
              <dd className="text-neutral-800">{formatDate(record.validUntil)}</dd>
            </>
          ) : null}
          {project !== undefined && project.id !== record.id ? (
            <>
              <dt className="text-neutral-500">Project</dt>
              <dd>
                <Link href={recordPath(project.id)} className="text-neutral-900 hover:underline">
                  {project.title}
                </Link>
              </dd>
            </>
          ) : null}
        </dl>

        <p className="mt-10 text-xs text-neutral-500">{SITE.recordsNote}</p>
      </article>
    </main>
  );
}
