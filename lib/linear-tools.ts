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