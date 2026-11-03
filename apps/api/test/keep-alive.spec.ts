import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { keepQdrantAlive } from "../src/keep-alive";
import { testEnv } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("keepQdrantAlive", () => {
  it("reads the size of the collection and logs it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const count = vi.fn(async () => 82);

    await expect(keepQdrantAlive(testEnv, { qdrant: { count } })).resolves.toBe(82);

    expect(count).toHaveBeenCalledWith(testEnv.QDRANT_COLLECTION);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ event: "keep-alive", status: "ok", points: 82 });
  });

  it("logs a short error without any key or address, and still fails the run", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = {
      count: async () => {
        throw new Error("Qdrant request failed with status 503");
      },
    };

    await expect(keepQdrantAlive(testEnv, { qdrant: failing })).rejects.toThrow("503");

    const logged = String(error.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toEqual({ event: "keep-alive", status: "error", message: "Qdrant request failed with status 503" });
    for (const secret of [testEnv.QDRANT_API_KEY, testEnv.QDRANT_URL, testEnv.GEMINI_API_KEY]) expect(logged).not.toContain(secret);
  });

  it("cuts a very long error message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = {
      count: async () => {
        throw new Error("x".repeat(5000));
      },
    };

    await expect(keepQdrantAlive(testEnv, { qdrant: failing })).rejects.toThrow();

    expect(String(error.mock.calls[0]?.[0]).length).toBeLessThan(400);
  });
});

describe("the Worker's scheduled handler", () => {
  it("exists, so the cron trigger has something to run", () => {
    expect(typeof worker.scheduled).toBe("function");
  });
});
