import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("getLinearClient", () => {
  const originalEnv = process.env.LINEAR_API_KEY;

  beforeEach(() => {
    // Reset module singleton between tests by reimporting
    delete process.env.LINEAR_API_KEY;
  });

  afterEach(() => {
    process.env.LINEAR_API_KEY = originalEnv;
  });

  test("throws when LINEAR_API_KEY is not set", async () => {
    const { getLinearClient } = await import("../lib/linear-client");
    expect(() => getLinearClient()).toThrow("LINEAR_API_KEY not configured");
  });

  test("returns a LinearClient when LINEAR_API_KEY is set", async () => {
    process.env.LINEAR_API_KEY = "test-key-abc";
    const { getLinearClient } = await import("../lib/linear-client");
    const client = getLinearClient();
    expect(client).toBeDefined();
    expect(typeof client.viewer).toBe("object");
  });
});