# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **bun** (see `engines.bun` in `package.json`).

- Install: `bun install`
- Type-check / build: `bun run build` (runs `tsc`, emits to `dist/`)
- Local dev (Vercel functions + Slack tunnel):
  ```sh
  vercel dev --listen 3000 --yes
  npx untun@latest tunnel http://localhost:3000
  ```
  Point the Slack app Event Subscriptions URL at `<tunnel>/api/events`.

No test suite is configured.

## Architecture

Single Vercel serverless function (`api/events.ts`) receives every Slack event and fans out by `event.type`. Handlers run via `waitUntil()` so the HTTP 200 acknowledgement returns to Slack before LLM work finishes — this is required to stay under Slack's 3s ack window.

Event flow:

1. `api/events.ts` — parses body, handles `url_verification` challenge inline, calls `verifyRequest` (HMAC-SHA256 of `v0:timestamp:rawBody` with `SLACK_SIGNING_SECRET`, timing-safe compared), then dispatches:
   - `app_mention` → `lib/handle-app-mention.ts`
   - `assistant_thread_started` → `lib/handle-messages.ts#assistantThreadMessage`
   - `message` (IM, non-bot) → `lib/handle-messages.ts#handleNewAssistantMessage`
2. Handlers call `getThread()` in `lib/slack-utils.ts` to hydrate Slack replies into `ModelMessage[]` for the AI SDK (strips `<@botId>` mention prefixes, tags bot messages as `assistant`).
3. `lib/generate-response.ts` — single entry to the LLM. Uses `@ai-sdk/openai` `gpt-4o` with `generateText`, `stopWhen: stepCountIs(10)`, and two tools (`getWeather` via open-meteo, `searchWeb` via Exa). Final step converts Markdown links/bold to Slack `mrkdwn` (`[x](y)` → `<y|x>`, `**` → `*`).
4. Status updates: app_mention uses a posted message that is later edited (`chat.update`); assistant IM threads use `assistant.threads.setStatus`. Both are passed to the LLM as an `updateStatus` callback that tools invoke mid-run.

### Lazy client initialization

Slack `WebClient` (`lib/slack-utils.ts`) and `Exa` (`lib/utils.ts`) are created lazily inside `getClient()` / `getExa()` accessors, not at module import. This is deliberate — it keeps cold-start imports cheap and lets `url_verification` requests succeed before env vars exist. **Do not hoist these into module-level constants.**

### Required env vars

`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENAI_API_KEY`, `EXA_API_KEY`.

### Extending tools

Add entries to the `tools` object in `lib/generate-response.ts`. Follow the existing `tool({ description, inputSchema: z.object(...), execute })` pattern and call `updateStatus?.(...)` at the start of `execute` so the user sees progress.

## Stack notes

- **AI SDK v6** (`ai@^6`) with `ModelMessage` type and `stepCountIs` stop condition — not v4/v5 shape. `inputSchema` (not `parameters`) on tools.
- **TypeScript**: `strict`, `module: CommonJS`, `target: ESNext`, emits to `dist/`. `vercel.json` sets `outputDirectory: dist` and `api/events.ts` `maxDuration: 60`.
- **Slack SDK**: `@slack/web-api@^7`. Event types imported as `SlackEvent`, `AppMentionEvent`, `AssistantThreadStartedEvent`, `GenericMessageEvent`.
