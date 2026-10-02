import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import type { PromptInput } from "@opencode/schema/prompt-input"
import { createAppFixture } from "./fixture/app"
import { tmpdir } from "./fixture/fixture"
import { directory, json } from "./fixture/tui-client"

const location = { directory, project: { id: "project", directory, canonical: directory } }
const session = {
  id: "ses_rich_history",
  title: "Rich history fixture",
  projectID: "project",
  location: { directory },
  agent: "build",
  model: { providerID: "provider", id: "model" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
}
const pasted = "first line\nsecond line\nthird line\nfourth line"
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7u0AAAAASUVORK5CYII="

test.each([
  { kind: "image", restore: true },
  { kind: "paste", restore: true },
  { kind: "image", restore: false },
  { kind: "paste", restore: false },
])("$kind undo history submits only the active payload (restore: $restore)", async ({ kind, restore }) => {
  await using state = await tmpdir()
  const submissions: PromptInput.Prompt[] = []
  await using setup = await createAppFixture({
    state: state.path,
    args: { sessionID: session.id },
    config: { animations: false, prompt: { image_preview: false } },
    fetch: async (url, request) => {
      if (url.pathname === "/api/location") return json(location)
      if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
      if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
      if (/^\/api\/session\/[^/]+\/(message|inbox|permission)$/.test(url.pathname))
        return json({ data: [], cursor: {} })
      if (url.pathname === "/api/agent")
        return json({ location, data: [{ id: "build", mode: "primary", hidden: false, permissions: [] }] })
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "provider", name: "Provider" }] })
      if (url.pathname === "/api/model")
        return json({ location, data: [{ id: "model", providerID: "provider", name: "Model", variants: [] }] })
      if (url.pathname === `/api/session/${session.id}/prompt`) {
        const body = await request.json()
        submissions.push(body)
        return json({
          data: {
            id: body.id,
            sessionID: session.id,
            type: "user",
            time: { created: 10 },
            payload: { text: body.text, files: body.files },
            delivery: "steer",
          },
        })
      }
    },
  })

  await setup.waitForFrame(() => setup.renderer.currentFocusedRenderable instanceof TextareaRenderable)
  const input = setup.renderer.currentFocusedRenderable as TextareaRenderable
  const label = kind === "image" ? "[Image 1]" : "[Pasted ~4 lines]"
  const filepath = `${state.path}/image.png`
  await Bun.write(filepath, Buffer.from(png, "base64"))
  await setup.mockInput.pasteBracketedText(kind === "image" ? filepath : pasted)
  await setup.waitForFrame(() => input.plainText === label + " ")

  setup.mockInput.pressKey("-", { ctrl: true })
  await setup.waitForFrame(() => input.plainText === "")
  expect(input.extmarks.getAll()).toEqual([])

  if (restore) {
    setup.mockInput.pressKey(".", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === label + " ")
    expect(input.getLineHighlights(0)).toHaveLength(1)

    setup.mockInput.pressKey("a", { ctrl: true })
    setup.mockInput.pressKey("k", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === "")
    setup.mockInput.pressKey("-", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === label + " ")
    expect(input.getLineHighlights(0)).toHaveLength(1)
  }
  if (!restore) await setup.mockInput.typeText("Just text")

  setup.mockInput.pressEnter()
  await setup.waitForFrame(() => submissions.length === 1)
  expect(submissions[0]?.text).toBe(restore ? (kind === "image" ? label + " " : pasted + " ") : "Just text")
  expect(submissions[0]?.files).toEqual(
    restore && kind === "image"
      ? [{ uri: `data:image/png;base64,${png}`, name: "image.png", mention: { start: 0, end: 9, text: label } }]
      : [],
  )
})
