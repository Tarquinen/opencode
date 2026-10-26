export * as ClaudeInstructions from "./instructions.js"

import type { SystemPart } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Option, Schema } from "effect"
import { ClaudeSystemPrompt } from "./language-model/system-prompt.js"
import { ClaudeProvider } from "./provider.js"

const KINDS = ["context", "generate", "compaction"] as const

// OpenCode keys each instruction source it renders into the system prompt.
const decodeSources = Schema.decodeUnknownOption(
  Schema.Array(Schema.Struct({ key: Schema.String, text: Schema.String })),
)

// Claude Code writes its own date and environment, so OpenCode's would repeat them.
const SUPPLIED_BY_CLAUDE = new Set(["core/date", "core/environment"])

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

function instructions(system: ReadonlyArray<SystemPart>) {
  const texts: string[] = []
  for (const part of system) {
    const sources = decodeSources(part.metadata?.instructions)
    if (Option.isNone(sources)) continue
    for (const source of sources.value) {
      if (SUPPLIED_BY_CLAUDE.has(source.key)) continue
      texts.push(source.text)
    }
  }
  return texts.join("\n\n")
}
