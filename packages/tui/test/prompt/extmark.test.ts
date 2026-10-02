import { describe, expect, test } from "bun:test"
import { EditBuffer, EditorView } from "@opentui/core"
import { Skill } from "@opencode/schema/skill"
import { createPromptExtmark, syncPromptParts, type PromptPart } from "../../src/prompt/extmark"
import { emptyPrompt } from "../../src/prompt/history"
import { promptOffsetWidth } from "../../src/prompt/display"

function editor() {
  const buffer = EditBuffer.create("unicode")
  const view = EditorView.create(buffer, 80, 10)
  const typeId = view.extmarks.registerType("prompt-part")
  let prompt = emptyPrompt()
  buffer.on("content-changed", () => {
    prompt = syncPromptParts({ ...prompt, text: buffer.getText() }, view.extmarks.getAllForTypeId(typeId))
  })
  return {
    buffer,
    view,
    get prompt() {
      return prompt
    },
    async edit(run: () => void) {
      const changed = new Promise<void>((resolve) => buffer.once("content-changed", resolve))
      run()
      await changed
    },
    paste(label: string, data: PromptPart) {
      const start = view.getVisualCursor().offset
      buffer.insertText(label + " ")
      return createPromptExtmark(view, {
        start,
        end: start + promptOffsetWidth(label),
        virtual: true,
        styleId: 1,
        typeId,
        data,
      })
    },
    [Symbol.dispose]() {
      view.destroy()
      buffer.destroy()
    },
  }
}

const mention = { start: 0, end: 9, text: "[Image 1]" }
const image = { type: "file", value: { uri: "data:image/png;base64,AAA", mention } } satisfies PromptPart
const parts: { label: string; part: PromptPart }[] = [
  { label: mention.text, part: image },
  {
    label: "@file.txt",
    part: { type: "file", value: { uri: "file:///file.txt", mention: { ...mention, text: "@file.txt" } } },
  },
  {
    label: "@helper",
    part: { type: "agent", value: { name: "helper", mention: { start: 0, end: 7, text: "@helper" } } },
  },
  {
    label: "@demo",
    part: { type: "skill", value: { id: Skill.ID.make("demo"), mention: { start: 0, end: 5, text: "@demo" } } },
  },
  {
    label: "[Pasted ~4 lines]",
    part: {
      type: "pasted",
      value: { text: "one\ntwo\nthree\nfour", source: { start: 0, end: 17, text: "[Pasted ~4 lines]" } },
    },
  },
]

describe("rich prompt editing history", () => {
  test.each(parts)("restores $label and its payload after deleting it", async ({ label, part }) => {
    using input = editor()
    await input.edit(() => input.paste(label, part))
    const original = structuredClone(input.prompt)

    await input.edit(() => input.buffer.deleteRange(0, 0, 0, promptOffsetWidth(label + " ")))
    expect(input.prompt).toEqual(emptyPrompt())

    await input.edit(() => input.buffer.undo())
    expect(input.prompt).toEqual(original)
    expect(input.buffer.getLineHighlights(0)).toHaveLength(1)

    await input.edit(() => input.buffer.redo())
    expect(input.prompt).toEqual(emptyPrompt())

    await input.edit(() => input.buffer.undo())
    expect(input.prompt).toEqual(original)
    expect(input.buffer.getLineHighlights(0)).toHaveLength(1)
  })

  test("undoing a paste removes the attachment and redo restores its highlight", async () => {
    using input = editor()
    await input.edit(() => input.paste(mention.text, image))
    const original = structuredClone(input.prompt)

    await input.edit(() => input.buffer.undo())
    expect(input.prompt).toEqual(emptyPrompt())
    expect(input.buffer.getLineHighlights(0)).toEqual([])

    await input.edit(() => input.buffer.redo())
    expect(input.prompt).toEqual(original)
    expect(input.buffer.getLineHighlights(0)).toHaveLength(1)
  })

  test("different images with the same label keep their own payloads", async () => {
    using input = editor()
    await input.edit(() => input.paste(mention.text, image))
    await input.edit(() => input.buffer.deleteRange(0, 0, 0, 10))
    await input.edit(() =>
      input.paste(mention.text, { type: "file", value: { uri: "data:image/png;base64,BBB", mention } }),
    )
    expect(input.prompt.files?.[0]?.uri).toBe("data:image/png;base64,BBB")

    await input.edit(() => input.buffer.undo())
    expect(input.prompt.files).toEqual([])
    await input.edit(() => input.buffer.undo())
    expect(input.prompt.files?.[0]?.uri).toBe(image.value.uri)

    await input.edit(() => input.buffer.redo())
    await input.edit(() => input.buffer.redo())
    expect(input.prompt.files?.[0]?.uri).toBe("data:image/png;base64,BBB")
  })

  test("prompt edits do not mutate the payload saved in undo history", async () => {
    using input = editor()
    const part = structuredClone(image)
    await input.edit(() => input.paste(mention.text, part))
    part.value.uri = "data:image/png;base64,BBB"
    input.prompt.files![0]!.mention!.text = "changed"

    input.buffer.setCursorByOffset(0)
    await input.edit(() => input.buffer.insertText("X "))
    expect(input.prompt.files?.[0]?.mention).toEqual({ ...mention, start: 2, end: 11 })

    await input.edit(() => input.buffer.undo())
    expect(input.prompt.files).toEqual([image.value])
  })

  test("resetting the buffer discards rich-item undo and redo history", async () => {
    using input = editor()
    await input.edit(() => input.paste(mention.text, image))
    await input.edit(() => input.buffer.undo())
    await input.edit(() => input.buffer.setText("new draft"))
    expect(input.buffer.canUndo()).toBe(false)
    expect(input.buffer.canRedo()).toBe(false)
    expect(input.buffer.undo()).toBeNull()
    expect(input.buffer.redo()).toBeNull()
    expect(input.view.extmarks.getAll()).toEqual([])

    await input.edit(() => input.buffer.insertText("!"))
    await input.edit(() => input.buffer.undo())
    expect(input.prompt.text).toBe("new draft")
    expect(input.prompt.files).toEqual([])
  })
})
