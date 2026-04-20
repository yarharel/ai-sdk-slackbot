import { describe, test, expect, mock, spyOn, afterEach } from "bun:test";
import * as slackUtils from "../lib/slack-utils";

// Mock the Slack WebClient
const mockUsersInfo = mock(() =>
  Promise.resolve({
    ok: true,
    user: { profile: { email: "alice@example.com" } },
  })
);

const mockGetClient = spyOn(slackUtils, "getClient").mockImplementation(() => ({
  users: { info: mockUsersInfo },
} as any));

afterEach(() => {
  mockGetClient.mockClear();
});

process.env.SLACK_BOT_TOKEN = "test-token";
const { getSlackUserEmail } = await import("../lib/slack-utils");

describe("getSlackUserEmail", () => {
  test("returns email when Slack user has a profile email", async () => {
    const email = await getSlackUserEmail("U12345");
    expect(email).toBe("alice@example.com");
    expect(mockUsersInfo).toHaveBeenCalledWith({ user: "U12345" });
  });

  test("returns null when user has no email", async () => {
    mockUsersInfo.mockResolvedValueOnce({
      ok: true,
      user: { profile: {} },
    });
    const email = await getSlackUserEmail("U99999");
    expect(email).toBeNull();
  });

  test("returns null when Slack API throws", async () => {
    mockUsersInfo.mockRejectedValueOnce(new Error("api_error"));
    const email = await getSlackUserEmail("U00000");
    expect(email).toBeNull();
  });
});