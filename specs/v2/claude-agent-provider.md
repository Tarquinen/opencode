# Claude Agent Provider

## Overview

The Claude Agent provider lets people use Claude models in opencode with their own Claude Code login. opencode runs the user's installed `claude` program through Anthropic's Claude Agent SDK.

Claude does the thinking. opencode runs the tools, keeps the history and shows the session like it would for any other model.

## Name and Login

### Name

The provider is called "Claude Agent", with the ID `claude-agent`. The SDK's [branding guidelines](https://code.claude.com/docs/en/agent-sdk/overview#branding-guidelines) allow "Claude Agent" but do not allow "Claude Code" as a product name. T3 Code calls its version "Claude Code" anyway, maybe we can be allowed to do so too?

### Login

- opencode runs the user's own `claude`, found on `PATH` or set with `OPENCODE_CLAUDE_PATH`. It only uses the public SDK. It never sits between Claude Code and Anthropic or changes Claude Code's requests.
- opencode never reads Claude Code's saved login. Users sign in with `claude` in their terminal. `/connect` only records that they chose this login method.
- Any login works: a subscription, an API key or a cloud account.

## What Claude Sees

### System Prompt

- Chats use Claude Code's own system prompt, plus a short note saying it is running in opencode.
- Why: sending opencode's build prompt instead failed with `400 Third-party apps now draw from your extra usage, not your plan limits.` Adding all of opencode's extra system text on top of Claude Code's prompt failed the same way. OpenChamber and T3 Code also keep Claude Code's prompt.

### Instructions

- On top of Claude Code's prompt, we add the selected agent's prompt as its role, and opencode's instructions: AGENTS.md files, skills, MCP instructions, project references and so on.
- opencode now labels each instruction source with a key. The plugin passes every source except the date and environment, because Claude Code already writes those. This is a core change, potentially slightly outside the scope of this PR.

### Tools

- Claude Code's built-in tools are off. Claude gets opencode's tools instead.
- When Claude calls a tool, the plugin holds the call. opencode runs it like any other model's tool call, including permission prompts, then sends the result back to Claude.
- Why: the history looks the same whichever model wrote it, so switching between Claude and other models works. There is also only one permission system.
- If opencode's tools cannot be given to Claude, the request fails. It never falls back to Claude Code's tools.
- When the list of tools changes, the Claude process restarts, because the SDK cannot swap tools while running. Reaching the step limit works the same way: Claude restarts with no tools.

## Claude Code Settings

Claude Code reads none of the user's Claude settings. The plugin passes every setting directly when it starts Claude.

### Turned Off

opencode has its own version of each of these:

- Settings files in `~/.claude` and the project's `.claude` folder
- CLAUDE.md files, hooks, MCP servers, skills and built-in tools
- Auto memory, auto compaction, away summaries, tool search and the advisor tool

We also clear two variables a user might have set in their shell. `CLAUDE_CODE_SIMPLE` would skip the subscription login. `CLAUDE_CODE_EFFORT_LEVEL` would override the effort chosen in opencode.

### Set by opencode

- Which `claude` to run, and the session's folder
- The model and effort chosen in opencode. These change without a restart.
- The system prompt described above
- opencode's tools, as the only tools Claude may use. Anything else is refused without asking.
- Two hooks: one matches each Claude tool call to opencode's tool call, and one gives Claude the images and PDFs from opencode's tool results
- Thinking with summaries, so opencode has reasoning text to show
- Messages sent exactly as typed, so Claude does not treat `/commands` or `@file` specially. This needs Claude Code 2.1.248 or later.
- A higher limit on tool output, so opencode's own truncation applies instead
- Saved Claude sessions for chats, but not for side calls such as titles

### User Config

Users can configure the `claude-agent` provider and its models in opencode config. We map opencode's keys to the matching Claude Code setting:

| opencode                 | Claude Code                     |
| ------------------------ | ------------------------------- |
| `settings.baseURL`       | `ANTHROPIC_BASE_URL`            |
| `settings.apiKey`        | `ANTHROPIC_API_KEY`             |
| `settings.authToken`     | `ANTHROPIC_AUTH_TOKEN`          |
| `settings.headerTimeout` | `API_TIMEOUT_MS`                |
| `settings.chunkTimeout`  | `CLAUDE_STREAM_IDLE_TIMEOUT_MS` |
| `headers`                | `ANTHROPIC_CUSTOM_HEADERS`      |
| `body`                   | `CLAUDE_CODE_EXTRA_BODY`        |
| effort                   | the SDK's `effort` option       |
| max output tokens        | `CLAUDE_CODE_MAX_OUTPUT_TOKENS` |

- A model's config overrides the provider's.
- Settings are applied in this order, with later ones winning: the user's shell, then opencode config, then the settings we turn off.
- Changing any of these restarts the Claude process.
- Without an explicit max output, we drop opencode's automatic limit and let Claude pick its own.

## History and Switching Models

- opencode's history is the source of truth. Claude's replies are saved in opencode's database like any other model's, so switching from Claude to another model just works.
- Claude cannot load history it did not write. When a user switches to Claude, everything Claude has not seen is sent as one user message, wrapped in `<conversation-checkpoint>`, without thinking text.
- When a user switches back to Claude later, only the part it missed is sent.
- After an edit or undo, the plugin copies Claude's session up to the last point where both histories match and continues from there. If nothing matches, Claude starts fresh with the whole history.
- When a user undoes and sends the same message again, the copy leaves out that last message. Keeping it caused `400 This model does not support assistant message prefill`.
- Unexpected copy errors are shown to the user. We only start fresh when history is actually missing.

## Running Claude

### Processes

- Each session has one long-running `claude` process. It stops after 5 minutes idle, and the next message picks up the saved Claude session.
- The process restarts when the system prompt, tools, connection settings or output limit change.

### Errors and Usage

- Claude Code retries failed requests itself, so opencode does not retry for this provider. Errors such as reaching a plan limit show once.
- Cost shows as $0 because usage is covered by the subscription.
- Claude reports token usage for a message several times. We keep the highest count instead of adding them up, so opencode does not compact too early.
- Each model's context size comes from Claude. Without it, opencode's 200k default applies.
- The model list is checked on `/connect` and saved. Startup only checks Claude when no list has been saved yet.

### Titles, Summaries and Compaction

- Titles use opencode's title prompt instead of Claude Code's, because a title is a standalone task.
- Summaries and compaction run on a throwaway copy of the chat. They keep the chat's tools and prompt so Claude can reuse its prompt cache. In one test, newly cached tokens fell from 8,577 to 32.
- opencode's compaction and subagents are used, not Claude Code's.

## Shipping

- The provider is built into core, not shipped as a separate package. A separate package meant extra publishing work and a circular test dependency.
- The SDK is an optional dependency. It only loads when first used, so it does not slow down startup.
- The provider is skipped where opencode cannot start local programs, such as hosted opencode and remote workspaces. A stub lets hosted builds work without the SDK.
- It is registered before opencode's fallback for unknown providers (issue #42788).
- There are no plugin options. `OPENCODE_CLAUDE_PATH` picks which `claude` to run.

## Testing

- Tests run a fake `claude` program that replays recorded real sessions. The SDK itself is not mocked, so tests exercise the real SDK.
- Thinking text is never saved in recordings.

## Limitations

- `claude` must be installed and signed in on the same machine. It does not work in hosted opencode or remote workspaces.
- Claude Code's built-in tools, skills, CLAUDE.md files, hooks, MCP servers, memory and slash commands are not available. opencode's versions are used instead.
- Chats follow Claude Code's base prompt, not opencode's built-in agent prompts. Custom agent prompts still apply.
- Temperature, top-p, top-k, penalties, seed and stop sequences are not supported.
- Base URLs and headers come only from config. Plugins cannot change them per request.
- History from other models reaches Claude as a catch-up message, not as Claude's own memory.
- Every side call and subagent runs its own `claude` process and uses plan limits.
- Cost shows as $0. Plan usage is only visible when a limit is reached.
- Recovery after a crash in the middle of a turn is limited. Picking up between turns works.

## Open Questions
