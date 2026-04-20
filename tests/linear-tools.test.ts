import { describe, test, expect, mock, spyOn, afterEach, afterAll } from "bun:test";
import * as linearClientModule from "../lib/linear-client";

const mockIssueNodes = [
  {
    identifier: "ENG-42",
    title: "Fix login bug",
    url: "https://linear.app/team/issue/ENG-42",
    priority: 1,
    state: Promise.resolve({ name: "In Progress", type: "started" }),
    team: Promise.resolve({ name: "Engineering" }),
  },
];

const mockUser = {
  id: "user-abc",
  assignedIssues: mock(() =>
    Promise.resolve({ nodes: mockIssueNodes })
  ),
};

const mockSearchNodes = [
  {
    identifier: "ENG-99",
    title: "Search result issue",
    url: "https://linear.app/team/issue/ENG-99",
    priority: 3,
    state: Promise.resolve({ name: "To Do", type: "unstarted" }),
    team: Promise.resolve({ name: "Product" }),
  },
];

const mockGetLinearClient = spyOn(linearClientModule, "getLinearClient").mockImplementation(() => ({
  users: mock(() => Promise.resolve({ nodes: [mockUser] })),
  issues: mock(() => Promise.resolve({ nodes: mockSearchNodes })),
} as any));

afterEach(() => {
  mockGetLinearClient.mockClear();
});

afterAll(() => {
  mockGetLinearClient.mockRestore();
});

const { createLinearTools } = await import("../lib/linear-tools");

describe("getMyLinearIssues", () => {
  test("returns assigned issues for user email", async () => {
    mockGetLinearClient.mockImplementation(() => ({
      users: mock(() => Promise.resolve({ nodes: [mockUser] })),
      issues: mock(() => Promise.resolve({ nodes: mockSearchNodes })),
    } as any));
    const tools = createLinearTools("alice@example.com");
    const result = await tools.getMyLinearIssues.execute({ status: "all" }, {} as never);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      id: "ENG-42",
      title: "Fix login bug",
      status: "In Progress",
      priority: "Urgent",
      url: "https://linear.app/team/issue/ENG-42",
      team: "Engineering",
    });
  });

  test("returns error when no Linear user found for email", async () => {
    mockGetLinearClient.mockImplementation(() => ({
      users: mock(() => Promise.resolve({ nodes: [] })),
      issues: mock(() => Promise.resolve({ nodes: [] })),
    } as any));
    const tools = createLinearTools("unknown@example.com");
    const result = await tools.getMyLinearIssues.execute({ status: "all" }, {} as never);
    expect(result.error).toContain("No Linear user found");
  });
});

describe("searchLinearIssues", () => {
  test("searches issues by keyword", async () => {
    mockGetLinearClient.mockImplementation(() => ({
      users: mock(() => Promise.resolve({ nodes: [mockUser] })),
      issues: mock(() => Promise.resolve({ nodes: mockSearchNodes })),
    } as any));
    const tools = createLinearTools("alice@example.com");
    const result = await tools.searchLinearIssues.execute(
      { query: "search result", assignedToMe: false },
      {} as never
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe("ENG-99");
  });
});