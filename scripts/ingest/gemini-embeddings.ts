
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
    EVAL_FILE,
    RECORDS_FILE,
    loadJson,
} from "../lib/eval-data.ts";
import { validateEvalData } from "../validate-eval.ts";
import type { Corpus, KnowledgeRecord } from "../lib/eval-data.ts";

const MODEL = "gemini-embedding-2";
const DIMENSIONS = 768;
const BATCH_SIZE = 5;
const DATABASE_NAME = "portfolio-knowledge";

const API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

interface ExistingEmbedding {
    id: string;
    content_hash: string;
    embedding_model: string;
    embedding_dimensions: number;
}

interface GeminiEmbeddingResponse {
    embedding?: {
        values?: unknown;
    };
    error?: {
        message?: string;
    };
}

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function sqlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function recordText(record: KnowledgeRecord): string {
    return `${record.title}\n\n${record.content}`;
}

function contentHash(record: KnowledgeRecord): string {
    return sha256(
        `${MODEL}\n${DIMENSIONS}\n${recordText(record)}`,
    );
}

function validateVector(values: unknown): number[] {
    if (
        !Array.isArray(values) ||
        values.length !== DIMENSIONS ||
        !values.every(
            (value) =>
                typeof value === "number" &&
                Number.isFinite(value),
        )
    ) {
        throw new Error(
            `Expected ${DIMENSIONS} finite embedding values.`,
        );
    }

    return values as number[];
}

async function embed(
    text: string,
    apiKey: string,
): Promise<number[]> {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
            content: {
                parts: [{ text }],
            },
            output_dimensionality: DIMENSIONS,
        }),
    });

    let body: GeminiEmbeddingResponse;

    try {
        body = (await response.json()) as GeminiEmbeddingResponse;
    } catch {
        throw new Error(
            `Gemini returned invalid JSON (HTTP ${response.status}).`,
        );
    }

    if (!response.ok) {
        throw new Error(
            `Gemini embedding request failed: ${
                body.error?.message ?? `HTTP ${response.status}`
            }`,
        );
    }

    if (
        typeof body.embedding !== "object" ||
        body.embedding === null ||
        !("values" in body.embedding)
    ) {
        throw new Error(
            "Gemini returned an invalid embedding response.",
        );
    }

    return validateVector(body.embedding.values);
}


function runWrangler(args: string[]): string {
    const apiDirectory = join(process.cwd(), "apps", "api");

    const packagePath = spawnSync(
        process.execPath,
        [
            "-p",
            "require.resolve('wrangler/package.json')",
        ],
        {
            encoding: "utf8",
            cwd: apiDirectory,
        },
    );

    if (packagePath.status !== 0) {
        throw new Error(
            `Could not locate Wrangler:\n${packagePath.stderr ?? ""}`,
        );
    }

    const wranglerEntry = join(
        packagePath.stdout.trim().replace(/package\.json$/, ""),
        "bin",
        "wrangler.js",
    );

    const execution = spawnSync(
        process.execPath,
        [wranglerEntry, ...args],
        {
            encoding: "utf8",
            cwd: apiDirectory,
            windowsHide: true,
        },
    );

    if (execution.error) {
        throw new Error(
            `Could not start Wrangler: ${execution.error.message}`,
        );
    }

    if (execution.status !== 0) {
        throw new Error(
            `Wrangler failed:\n${execution.stdout ?? ""}\n${execution.stderr ?? ""}`,
        );
    }

    return execution.stdout;
}



function applySqlFile(filePath: string): void {
    runWrangler([
        "d1",
        "execute",
        DATABASE_NAME,
        "--local",
        "--file",
        filePath,
    ]);
}

function loadExistingEmbeddings(): Map<string, ExistingEmbedding> {
    const output = runWrangler([
        "d1",
        "execute",
        DATABASE_NAME,
        "--local",
        "--command",
        "SELECT id, content_hash, embedding_model, embedding_dimensions FROM knowledge_embeddings WHERE visibility = 'public';",
        "--json",
    ]);

    let parsed: unknown;

    try {
        parsed = JSON.parse(output);
    } catch {
        throw new Error(
            "Could not parse Wrangler JSON output. Refusing to generate embeddings.",
        );
    }

    if (!Array.isArray(parsed)) {
        throw new Error(
            "Unexpected Wrangler response: expected an array.",
        );
    }

    const embeddings = new Map<string, ExistingEmbedding>();

    for (const result of parsed) {
        if (
            typeof result !== "object" ||
            result === null ||
            !("success" in result) ||
            result.success !== true ||
            !("results" in result) ||
            !Array.isArray(result.results)
        ) {
            throw new Error(
                "Unexpected or unsuccessful Wrangler query result.",
            );
        }

        for (const row of result.results) {
            if (
                typeof row !== "object" ||
                row === null ||
                !("id" in row) ||
                typeof row.id !== "string" ||
                !("content_hash" in row) ||
                typeof row.content_hash !== "string" ||
                !("embedding_model" in row) ||
                typeof row.embedding_model !== "string" ||
                !("embedding_dimensions" in row) ||
                typeof row.embedding_dimensions !== "number"
            ) {
                throw new Error(
                    "Invalid existing embedding row returned by D1.",
                );
            }

            embeddings.set(row.id, {
                id: row.id,
                content_hash: row.content_hash,
                embedding_model: row.embedding_model,
                embedding_dimensions: row.embedding_dimensions,
            });
        }
    }

    return embeddings;
}

function validateCorpus(corpus: Corpus): void {
    if (!corpus.isSynthetic) {
        throw new Error(
            "Ingestion is restricted to the synthetic dataset.",
        );
    }

    if (!Array.isArray(corpus.records)) {
        throw new Error("The dataset records field must be an array.");
    }

    for (const record of corpus.records) {
        if (
            typeof record.id !== "string" ||
            typeof record.title !== "string" ||
            typeof record.content !== "string" ||
            typeof record.visibility !== "string" ||
            typeof record.isSynthetic !== "boolean" ||
            typeof record.updatedAt !== "string"
        ) {
            throw new Error(
                "The dataset contains a record with invalid required fields.",
            );
        }

        if (
            record.visibility === "public" &&
            !record.isSynthetic
        ) {
            throw new Error(
                `Public record "${record.id}" is not synthetic. Refusing ingestion.`,
            );
        }
    }
}

async function main(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error(
            "GEMINI_API_KEY is not set in this terminal session.",
        );
    }

    // Load and validate the dataset before making external API requests.
    const loaded: unknown = loadJson(RECORDS_FILE);

    if (
        typeof loaded !== "object" ||
        loaded === null ||
        !("records" in loaded) ||
        !Array.isArray(loaded.records) ||
        !("isSynthetic" in loaded) ||
        typeof loaded.isSynthetic !== "boolean"
    ) {
        throw new Error("Knowledge dataset has an invalid structure.");
    }

    const corpus = loaded as Corpus;

    validateCorpus(corpus);

    const evaluation = loadJson(EVAL_FILE);
    const validationErrors = validateEvalData(corpus, evaluation);

    if (validationErrors.length > 0) {
        throw new Error(
            `Dataset validation failed:\n${validationErrors.join("\n")}`,
        );
    }

    // Select public records before building text or calling Gemini.
    const publicRecords = corpus.records.filter(
        (record) => record.visibility === "public",
    );

    if (publicRecords.length === 0) {
        throw new Error(
            "No public records found. Refusing to continue.",
        );
    }

    console.log(`Public synthetic records selected: ${publicRecords.length}`);
    console.log("Private records excluded before API requests.");

    // Check local D1 before paying for or generating any embeddings.
    const existingEmbeddings = loadExistingEmbeddings();

    const recordsToProcess = publicRecords.filter((record) => {
        const existing = existingEmbeddings.get(record.id);

        return (
            !existing ||
            existing.content_hash !== contentHash(record) ||
            existing.embedding_model !== MODEL ||
            existing.embedding_dimensions !== DIMENSIONS
        );
    });

    console.log(
        `Records requiring embeddings: ${recordsToProcess.length}`,
    );
    console.log(
        `Unchanged records skipped: ${
            publicRecords.length - recordsToProcess.length
        }`,
    );

    if (recordsToProcess.length === 0) {
        console.log(
            "All public records already have current embeddings. Nothing to do.",
        );
        return;
    }

    const tempDir = await mkdtemp(
        join(tmpdir(), "portfolio-embeddings-"),
    );

    try {
        let storedCount = 0;

        for (
            let start = 0;
            start < recordsToProcess.length;
            start += BATCH_SIZE
        ) {
            const batch = recordsToProcess.slice(
                start,
                start + BATCH_SIZE,
            );

            const statements: string[] = [];

            for (const record of batch) {
                // Defense in depth: never send a non-public record to Gemini.
                if (
                    record.visibility !== "public" ||
                    !record.isSynthetic
                ) {
                    throw new Error(
                        `Record "${record.id}" failed the privacy check.`,
                    );
                }

                const text = recordText(record);
                const vector = await embed(text, apiKey);
                const hash = contentHash(record);

                statements.push(`
                    INSERT INTO knowledge_embeddings (
                        id,
                        title,
                        content,
                        embedding_json,
                        embedding_model,
                        embedding_dimensions,
                        content_hash,
                        updated_at,
                        visibility
                    ) VALUES (
                        ${sqlString(record.id)},
                        ${sqlString(record.title)},
                        ${sqlString(record.content)},
                        ${sqlString(JSON.stringify(vector))},
                        ${sqlString(MODEL)},
                        ${DIMENSIONS},
                        ${sqlString(hash)},
                        ${sqlString(record.updatedAt)},
                        'public'
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        content = excluded.content,
                        embedding_json = excluded.embedding_json,
                        embedding_model = excluded.embedding_model,
                        embedding_dimensions = excluded.embedding_dimensions,
                        content_hash = excluded.content_hash,
                        updated_at = excluded.updated_at,
                        visibility = 'public';
                `);
            }

            const filePath = join(
                tempDir,
                `batch-${start}.sql`,
            );

            await writeFile(
                filePath,
                statements.join("\n"),
                "utf8",
            );

            applySqlFile(filePath);

            storedCount += batch.length;

            console.log(
                `Stored ${storedCount}/${recordsToProcess.length} changed public records.`,
            );
        }
    } finally {
        await rm(tempDir, {
            recursive: true,
            force: true,
        });
    }

    console.log(
        "Embedding ingestion completed against local D1 only.",
    );
}

main().catch((error: unknown) => {
    console.error(
        error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
});
