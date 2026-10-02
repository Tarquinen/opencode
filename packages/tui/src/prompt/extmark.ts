import type { Extmark, ExtmarkOptions, TextareaRenderable } from "@opentui/core"
import { unwrap } from "solid-js/store"
import { preserveMentionlessPromptAttachments } from "./attachment"
import type { PromptInfo } from "./history"

export type PromptPart =
  | { type: "file"; value: NonNullable<PromptInfo["files"]>[number] }
  | { type: "agent"; value: NonNullable<PromptInfo["agents"]>[number] }
  | { type: "skill"; value: NonNullable<PromptInfo["skills"]>[number] }
  | { type: "pasted"; value: PromptInfo["pasted"][number] }

export function createPromptExtmark(
  input: Pick<TextareaRenderable, "extmarks">,
  options: Omit<ExtmarkOptions, "data"> & { data: PromptPart },
) {
  // Undo records share this payload, so keep it separate from the mutable prompt store.
  return input.extmarks.create({ ...options, data: structuredClone(unwrap(options.data)) })
}

export function syncPromptParts(prompt: PromptInfo, extmarks: Extmark[]): PromptInfo {
  const files: NonNullable<PromptInfo["files"]> = []
  const agents: NonNullable<PromptInfo["agents"]> = []
  const skills: NonNullable<PromptInfo["skills"]> = []
  const pasted: PromptInfo["pasted"] = []

  for (const extmark of extmarks) {
    const part = extmark.data as PromptPart
    if (part.type === "pasted") {
      pasted.push({
        ...part.value,
        source: { ...part.value.source, start: extmark.start, end: extmark.end },
      })
      continue
    }

    const mention = { ...part.value.mention!, start: extmark.start, end: extmark.end }
    if (part.type === "file") {
      files.push({ ...part.value, mention })
      continue
    }
    if (part.type === "agent") {
      agents.push({ ...part.value, mention })
      continue
    }
    skills.push({ ...part.value, mention })
  }

  return {
    ...prompt,
    files: preserveMentionlessPromptAttachments(prompt.files, files),
    agents,
    skills,
    pasted,
  }
}
