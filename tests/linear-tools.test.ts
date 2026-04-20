import { describe, test, expect, mock } from "bun:test";

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

mock.module("../lib/linear-client", () => ({
  getLinearClient: () => ({
    users: mock(() =>
      Promise.resolve({ nodes: [mockUser] })
    ),
    issues: mock(() =>
      Promise.resolve({ nodes: mockSearchNodes })
    ),
  }),
}));

const { createLinearTools } = await import("../lib/linear-tools");

describe("getMyLinearIssues", () => {
  test("returns assigned issues for user email", async () => {
    const tools = createLinearTools("alice@example.com");
    const result = await tools.getMyLinearIssues.execute({ status: "all" }, {} as never);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      id: "ENG-42",
      title: "Fix login bug",
      status: "In Progress",
      priority: 1,
      url: "https://linear.app/team/issue/ENG-42",
      team: "Engineering",
    });
  });

  test("returns error when no Linear user found for email", async () => {
    mock.module("../lib/linear-client", () => ({
      getLinearClient: () => ({
        users: mock(() => Promise.resolve({ nodes: [] })),
        issues: mock(() => Promise.resolve({ nodes: [] })),
      }),
    }));
    const { createLinearTools: fresh } = await import("../lib/linear-tools");
    const tools = fresh("unknown@example.com");
    const result = await tools.getMyLinearIssues.execute({ status: "all" }, {} as never);
    expect(result.error).toContain("No Linear user found");
  });
});

describe("searchLinearIssues", () => {
  test("searches issues by keyword", async () => {
    // Re-import with original mock
    mock.module("../lib/linear-client", () => ({
      getLinearClient: () => ({
        users: mock(() => Promise.resolve({ nodes: [mockUser] })),
        issues: mock(() => Promise.resolve({ nodes: mockSearchNodes })),
      }),
    }));
    const { createLinearTools: fresh } = await import("../lib/linear-tools");
    const tools = fresh("alice@example.com");
    const result = await tools.searchLinearIssues.execute(
      { query: "search result", assignedToMe: false },
      {} as never
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe("ENG-99");
  });
});