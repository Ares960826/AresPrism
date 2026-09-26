import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMupdfClient, resetMupdfClient } from "./mupdf-client";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown[] }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  init() {
    this.onmessage?.({ data: ["INIT", 0, []] });
  }
}
beforeEach(() => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  resetMupdfClient();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("MuPDF worker failure recovery", () => {
  it("rejects waiting callers when initialization times out", async () => {
    const pending = getMupdfClient().countPages(1);
    const check = expect(pending).rejects.toThrow("initialization timed out");
    await vi.advanceTimersByTimeAsync(30000);
    await check;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    getMupdfClient();
    expect(FakeWorker.instances).toHaveLength(2);
  });
  it("rejects all pending calls immediately on fatal worker errors", async () => {
    const client = getMupdfClient();
    const worker = FakeWorker.instances[0];
    worker.init();
    const first = client.countPages(1);
    const second = client.getPageSize(1, 0);
    const checks = [
      expect(first).rejects.toThrow("crashed"),
      expect(second).rejects.toThrow("crashed"),
    ];
    await Promise.resolve();
    worker.onerror?.({ message: "crashed" });
    await Promise.all(checks);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects pending calls on reset and creates a fresh worker", async () => {
    const client = getMupdfClient();
    FakeWorker.instances[0].init();
    const pending = client.countPages(1);
    const check = expect(pending).rejects.toThrow("closed");
    await Promise.resolve();
    resetMupdfClient();
    await check;
    expect(getMupdfClient()).not.toBe(client);
  });
});
