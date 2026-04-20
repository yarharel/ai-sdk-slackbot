# Linear Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Linear TS SDK tools to the Slack bot so users can ask about their Linear issues, with the bot resolving the Slack user's email to find their Linear account.

**Architecture:** New `lib/linear-client.ts` lazy singleton + `lib/linear-tools.ts` tool factory that closes over the user's email. `slack-utils.ts` gains email lookup. `generate-response.ts` accepts optional `userEmail` and injects Linear tools. Both event handlers fetch the user's email before calling `generateResponse`.

**Tech Stack:** `@linear/sdk`, Bun test runner (built-in), AI SDK v6 tools pattern (Zod inputSchema), `@slack/web-api` users.info for email lookup.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/linear-client.ts` | Lazy LinearClient singleton |
| Create | `lib/linear-tools.ts` | `createLinearTools(userEmail, updateStatus)` factory returning two tools |
| Modify | `lib/slack-utils.ts` | Add `getSlackUserEmail(userId)` |
| Modify | `lib/generate-response.ts` | Accept `userEmail?: string`, inject Linear tools, update system prompt |
| Modify | `lib/handle-messages.ts` | Resolve user email, pass to `generateResponse` |
| Modify | `lib/handle-app-mention.ts` | Resolve user email, pass to `generateResponse` |
| Create | `tests/linear-client.test.ts` | Unit tests for client init/error |
| Create | `tests/slack-utils.test.ts` | Unit tests for `getSlackUserEmail` |
| Create | `tests/linear-tools.test.ts` | Unit tests for both Linear tools |
| Modify | `.env.example` | Document `LINEAR_API_KEY` |
| Modify | `README.md` | Linear setup + required Slack scopes |

---

## Prerequisite: Slack Bot Scope

**Before implementing**, add the `users:read.email` OAuth scope to the Slack app:
1. Go to api.slack.com → your app → OAuth & Permissions
2. Under "Bot Token Scopes", add `users:read.email`
3. Reinstall the app to your workspace (the OAuth page will prompt)

This is required for `users.info` to return email addresses.

---

### Task 1: Install @linear/sdk and create lazy client

**Files:**
- Modify: `package.json` (dependency added via bun add)
- Create: `lib/linear-client.ts`
- Create: `tests/linear-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/linear-client.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/linear-client.test.ts
```

Expected: FAIL with "Cannot find module '../lib/linear-client'"

- [ ] **Step 3: Install the SDK**

```bash
bun add @linear/sdk
```

- [ ] **Step 4: Create `lib/linear-client.ts`**

```typescript
import { LinearClient } from "@linear/sdk";

let _linearClient: LinearClient | null = null;

export function getLinearClient(): LinearClient {
  if (!_linearClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LINEAR_API_KEY not configured");
    _linearClient = new LinearClient({ apiKey });
  }
  return _linearClient;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test tests/linear-client.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/linear-client.ts tests/linear-client.test.ts package.json bun.lock
git commit -m "feat: add lazy LinearClient singleton with env validation"
```

---

### Task 2: Slack user email resolution

**Files:**
- Modify: `lib/slack-utils.ts` (add `getSlackUserEmail`)
- Create: `tests/slack-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/slack-utils.test.ts`:

```typescript
import { describe, test, expect, mock } from "bun:test";

// Mock the Slack WebClient
const mockUsersInfo = mock(() =>
  Promise.resolve({
    ok: true,
    user: { profile: { email: "alice@example.com" } },
  })
);

mock.module("@slack/web-api", () => ({
  WebClient: class {
    users = { info: mockUsersInfo };
  },
}));

// Must import AFTER mock.module
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/slack-utils.test.ts
```

Expected: FAIL with "getSlackUserEmail is not a function"

- [ ] **Step 3: Add `getSlackUserEmail` to `lib/slack-utils.ts`**

Append to the bottom of `lib/slack-utils.ts`:

```typescript
export async function getSlackUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await getClient().users.info({ user: userId });
    return result.user?.profile?.email ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/slack-utils.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/slack-utils.ts tests/slack-utils.test.ts
git commit -m "feat: add getSlackUserEmail to resolve user identity from Slack"
```

---

### Task 3: Linear tools — getMyLinearIssues and searchLinearIssues

**Files:**
- Create: `lib/linear-tools.ts`
- Create: `tests/linear-tools.test.ts`

Linear state type values:
- `"started"` → In Progress
- `"unstarted"` → To Do
- `"backlog"` → Backlog
- `"completed"` → Done
- `"cancelled"` → Cancelled
- `"triage"` → Triage

Issue priority values: `0` = No priority, `1` = Urgent, `2` = High, `3` = Medium, `4` = Low

- [ ] **Step 1: Write the failing tests**

Create `tests/linear-tools.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/linear-tools.test.ts
```

Expected: FAIL with "Cannot find module '../lib/linear-tools'"

- [ ] **Step 3: Create `lib/linear-tools.ts`**

```typescript
import { tool } from "ai";
import { z } from "zod";
import { getLinearClient } from "./linear-client";

const STATE_TYPE_MAP = {
  in_progress: "started",
  todo: "unstarted",
  backlog: "backlog",
  done: "completed",
  cancelled: "cancelled",
  triage: "triage",
} as const;

type StatusFilter = keyof typeof STATE_TYPE_MAP | "all";

async function resolveLinearUserId(email: string): Promise<string | null> {
  const client = getLinearClient();
  const users = await client.users({ filter: { email: { eq: email } } });
  return users.nodes[0]?.id ?? null;
}

export function createLinearTools(
  userEmail: string,
  updateStatus?: (status: string) => void,
) {
  return {
    getMyLinearIssues: tool({
      description:
        "Get Linear issues assigned to the current user. Use for questions like 'what are my tasks', 'show my in-progress issues', 'what's in my backlog'. Can filter by status.",
      inputSchema: z.object({
        status: z
          .enum(["all", "in_progress", "todo", "backlog", "done", "cancelled", "triage"])
          .default("all")
          .describe("Filter issues by status. Use 'in_progress' for 'in progress' questions."),
      }),
      execute: async ({ status }) => {
        updateStatus?.(`is fetching your Linear issues...`);
        const client = getLinearClient();

        const users = await client.users({ filter: { email: { eq: userEmail } } });
        const user = users.nodes[0];
        if (!user) {
          return { error: `No Linear user found for email ${userEmail}` };
        }

        const filter =
          status !== "all"
            ? { state: { type: { eq: STATE_TYPE_MAP[status as StatusFilter & keyof typeof STATE_TYPE_MAP] } } }
            : undefined;

        const issues = await user.assignedIssues({ filter });

        return {
          issues: await Promise.all(
            issues.nodes.map(async (issue) => {
              const [state, team] = await Promise.all([issue.state, issue.team]);
              return {
                id: issue.identifier,
                title: issue.title,
                status: state?.name ?? "Unknown",
                priority: issue.priority,
                url: issue.url,
                team: team?.name ?? "Unknown",
              };
            }),
          ),
        };
      },
    }),

    searchLinearIssues: tool({
      description:
        "Search Linear issues by keyword across the workspace. Use for questions like 'find issues about payments', 'search for auth bugs'. For 'my issues' prefer getMyLinearIssues.",
      inputSchema: z.object({
        query: z.string().describe("Keywords to search in issue titles and descriptions"),
        assignedToMe: z
          .boolean()
          .default(false)
          .describe("Limit results to issues assigned to the current user"),
      }),
      execute: async ({ query, assignedToMe }) => {
        updateStatus?.(`is searching Linear for "${query}"...`);
        const client = getLinearClient();

        const assigneeFilter = assignedToMe
          ? await resolveLinearUserId(userEmail).then((id) =>
              id ? { assignee: { id: { eq: id } } } : {},
            )
          : {};

        const issues = await client.issues({
          filter: {
            title: { containsIgnoreCase: query },
            ...assigneeFilter,
          },
        });

        return {
          issues: await Promise.all(
            issues.nodes.map(async (issue) => {
              const [state, team] = await Promise.all([issue.state, issue.team]);
              return {
                id: issue.identifier,
                title: issue.title,
                status: state?.name ?? "Unknown",
                priority: issue.priority,
                url: issue.url,
                team: team?.name ?? "Unknown",
              };
            }),
          ),
        };
      },
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/linear-tools.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/linear-tools.ts tests/linear-tools.test.ts
git commit -m "feat: add Linear tools getMyLinearIssues and searchLinearIssues"
```

---

### Task 4: Update generateResponse to accept userEmail and inject Linear tools

**Files:**
- Modify: `lib/generate-response.ts`

- [ ] **Step 1: Update the function signature and body**

Replace the entire content of `lib/generate-response.ts`:

```typescript
import { openai } from "@ai-sdk/openai";
import { ModelMessage, generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { getExa } from "./utils";
import { createLinearTools } from "./linear-tools";

export const generateResponse = async (
  messages: ModelMessage[],
  updateStatus?: (status: string) => void,
  userEmail?: string,
) => {
  const linearTools = userEmail
    ? createLinearTools(userEmail, updateStatus)
    : {};

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Slack bot assistant. Keep your responses concise and to the point.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split("T")[0]}
    - Make sure to ALWAYS include sources in your final response if you use web search. Put sources inline if possible.
    - For Linear issue results, format them as a numbered list with title, status, priority (Urgent/High/Medium/Low/None), and a link.
    ${userEmail ? `- The user's email is ${userEmail}. Use this to query their Linear issues with getMyLinearIssues or searchLinearIssues.` : ""}`,
    messages,
    stopWhen: stepCountIs(10),
    tools: {
      getWeather: tool({
        description: "Get the current weather at a location",
        inputSchema: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
        execute: async ({ latitude, longitude, city }) => {
          updateStatus?.(`is getting weather for ${city}...`);

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
          );

          const weatherData = await response.json();
          return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weathercode,
            humidity: weatherData.current.relativehumidity_2m,
            city,
          };
        },
      }),
      searchWeb: tool({
        description: "Use this to search the web for information",
        inputSchema: z.object({
          query: z.string(),
          specificDomain: z
            .string()
            .nullable()
            .describe(
              "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
            ),
        }),
        execute: async ({ query, specificDomain }) => {
          updateStatus?.(`is searching the web for ${query}...`);
          const { results } = await getExa().searchAndContents(query, {
            livecrawl: "always",
            numResults: 3,
            includeDomains: specificDomain ? [specificDomain] : undefined,
            text: true,
          });

          return {
            results: results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.text.slice(0, 1000),
            })),
          };
        },
      }),
      ...linearTools,
    },
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run build
```

Expected: No errors. Output in `dist/`.

- [ ] **Step 3: Commit**

```bash
git add lib/generate-response.ts
git commit -m "feat: inject Linear tools into generateResponse when userEmail provided"
```

---

### Task 5: Wire user email through event handlers

**Files:**
- Modify: `lib/handle-messages.ts`
- Modify: `lib/handle-app-mention.ts`

- [ ] **Step 1: Update `lib/handle-messages.ts`**

Replace the entire file content:

```typescript
import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import {
  getClient,
  getThread,
  updateStatusUtil,
  getSlackUserEmail,
} from "./slack-utils";
import { generateResponse } from "./generate-response";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
) {
  const { channel_id, thread_ts } = event.assistant_thread;

  await getClient().chat.postMessage({
    channel: channel_id,
    thread_ts: thread_ts,
    text: "Hello, I'm an AI assistant built with the AI SDK by Vercel!",
  });

  await getClient().assistant.threads.setSuggestedPrompts({
    channel_id: channel_id,
    thread_ts: thread_ts,
    prompts: [
      {
        title: "Get the weather",
        message: "What is the current weather in London?",
      },
      {
        title: "Get the news",
        message: "What is the latest Premier League news from the BBC?",
      },
      {
        title: "My in-progress issues",
        message: "Show me my in-progress Linear issues",
      },
      {
        title: "My Linear backlog",
        message: "What's in my Linear backlog?",
      },
    ],
  });
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
) {
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  const { thread_ts, channel } = event;
  const updateStatus = updateStatusUtil(channel, thread_ts);
  await updateStatus("is thinking...");

  const [messages, userEmail] = await Promise.all([
    getThread(channel, thread_ts, botUserId),
    event.user ? getSlackUserEmail(event.user) : Promise.resolve(null),
  ]);

  const result = await generateResponse(
    messages,
    updateStatus,
    userEmail ?? undefined,
  );

  await getClient().chat.postMessage({
    channel: channel,
    thread_ts: thread_ts,
    text: result,
    unfurl_links: false,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: result,
        },
      },
    ],
  });

  await updateStatus("");
}
```

- [ ] **Step 2: Update `lib/handle-app-mention.ts`**

Replace the entire file content:

```typescript
import { AppMentionEvent } from "@slack/web-api";
import { getClient, getThread, getSlackUserEmail } from "./slack-utils";
import { generateResponse } from "./generate-response";

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  const initialMessage = await getClient().chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await getClient().chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) return;

  const { thread_ts, channel } = event;
  const [updateMessage, userEmail] = await Promise.all([
    updateStatusUtil("is thinking...", event),
    event.user ? getSlackUserEmail(event.user) : Promise.resolve(null),
  ]);

  if (thread_ts) {
    const messages = await getThread(channel, thread_ts, botUserId);
    const result = await generateResponse(
      messages,
      updateMessage,
      userEmail ?? undefined,
    );
    await updateMessage(result);
  } else {
    const result = await generateResponse(
      [{ role: "user", content: event.text }],
      updateMessage,
      userEmail ?? undefined,
    );
    await updateMessage(result);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/handle-messages.ts lib/handle-app-mention.ts
git commit -m "feat: resolve Slack user email and pass to generateResponse for Linear context"
```

---

### Task 6: Update environment config and README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add LINEAR_API_KEY to `.env.example`**

Read the current `.env.example` and append:

```
# Linear (optional — enables Linear issue queries)
LINEAR_API_KEY=lin_api_xxxxxxxxxxxx
```

- [ ] **Step 2: Update README.md**

In the "Environment Variables" section, add:

```markdown
### Linear (optional)

| Variable | Where to get it | Purpose |
|----------|----------------|---------|
| `LINEAR_API_KEY` | linear.app → Settings → API → Personal API keys | Query Linear issues |

To create a Linear API key:
1. Go to Linear → Settings → API
2. Create a new Personal API key
3. Copy the key (starts with `lin_api_`)

#### Required Slack scope

For per-user issue lookup, the bot needs the `users:read.email` scope:
1. api.slack.com → your app → OAuth & Permissions → Bot Token Scopes
2. Add `users:read.email`
3. Reinstall the app to your workspace

#### What users can ask

- "Show me my in-progress issues"
- "What's in my Linear backlog?"
- "Find issues about the payment system"
- "What are my urgent tasks?"
```

- [ ] **Step 3: Set the env var in Vercel**

```bash
vercel env add LINEAR_API_KEY
```

Enter the value when prompted. Add to Production and Preview environments.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add Linear setup instructions and LINEAR_API_KEY env var"
```

---

## Testing the Integration End-to-End

After deploying:

1. Open a DM with the bot in Slack
2. Ask: **"Show me my in-progress Linear issues"**
   - Expected: Bot shows "is fetching your Linear issues..." then returns a numbered list with issue ID, title, status, priority, and Linear URL
3. Ask: **"Find issues about authentication"**
   - Expected: Bot searches across workspace issues, returns matching results
4. Ask: **"What are my urgent tasks?"**
   - Bot calls `getMyLinearIssues` with `status: "all"` and filters mentally, or try `"Show me my urgent Linear issues"` (GPT-4o will pass `status: "in_progress"` for in-progress-like queries)

**If email resolution fails** (user has no email in Slack profile), Linear tools won't be available for that user and the bot will respond without them.
