export * as ClaudeInstructions from "./instructions.js"

import type { SystemPart } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { ClaudeSystemPrompt } from "./language-model/system-prompt.js"
import { ClaudeProvider } from "./provider.js"

const KINDS = ["context", "generate", "compaction"] as const

export const register = Effect.fn("ClaudeInstructions.register")(function* (ctx: Context) {
  yield* Effect.forEach(
    KINDS,
    (kind) =>
      ctx.session.hook(
        kind,
        (event) =>
          Effect.gen(function* () {
            const agent = yield* ctx.agent.get({ agentID: event.agent }).pipe(Effect.orDie)
            // Read the role from the resolved agent, not by guessing which prompt text is a built-in.
            event.options[ClaudeSystemPrompt.AGENT_OPTION] = agent.data.system ?? ""
            event.options[ClaudeSystemPrompt.INSTRUCTIONS_OPTION] = instructions(event.system)
          }),
        { providerID: ClaudeProvider.ID },
      ),
    { discard: true },
  )
})

// The first part is OpenCode's own prompt, which Claude Code's prompt replaces.
function instructions(system: ReadonlyArray<SystemPart>) {
  const texts: string[] = []
  for (const part of system.slice(1)) texts.push(part.text)
  return texts.join("\n\n")
}
