/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { resolve } from "../../src/config"
import { Keymap } from "../../src/context/keymap"
import { createPromptState, RunPromptBody, type PromptState } from "../../src/mini/footer.prompt"
import { RUN_THEME_FALLBACK } from "../../src/mini/theme"
import type { RunPrompt } from "../../src/mini/types"
import { tmpdir } from "../fixture/fixture"

test("Mini restores attachment payloads through insertion and deletion undo", async () => {
  await using state = await tmpdir()
  const filepath = `${state.path}/image.png`
  await Bun.write(
    filepath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7u0AAAAASUVORK5CYII=",
      "base64",
    ),
  )
  const config = resolve({}, { terminalSuspend: true })
  const submissions: RunPrompt[] = []
  let prompt!: PromptState

  function Composer() {
    prompt = createPromptState({
      directory: () => state.path,
      findFiles: async () => [],
      agents: () => [],
      references: () => [],
      commands: () => [],
      state: () => ({
        phase: "idle",
        status: "",
        notice: "",
        model: "Model",
        usage: undefined,
        first: false,
        interrupt: 0,
        exit: 0,
      }),
      view: () => "prompt",
      prompt: () => true,
      width: () => 100,
      statusRows: () => 1,
      theme: () => RUN_THEME_FALLBACK.footer,
      mono: () => false,
      queuedPrompts: () => [],
      onQueuedPromptSteer: async () => false,
      onSubmit: (value) => {
        submissions.push(value)
        return true
      },
      onCycle: () => {},
      onInterrupt: () => false,
      onEditorOpen: async () => undefined,
      onInputClear: () => {},
      onExit: () => {},
      onSettings: () => {},
      onRows: () => {},
      onStatus: () => {},
    })
    return (
      <RunPromptBody
        {...prompt}
        theme={() => RUN_THEME_FALLBACK.footer}
        background={() => "transparent"}
        rail={() => RUN_THEME_FALLBACK.footer.text}
        mono={false}
        cursorStyle={config.cursor}
      />
    )
  }

  const setup = await testRender(
    () => (
      <Keymap.Provider config={config}>
        <Composer />
      </Keymap.Provider>
    ),
    {
      width: 100,
      height: 10,
      kittyKeyboard: true,
    },
  )
  setup.renderer.start()
  try {
    await setup.waitForFrame(() => setup.renderer.currentFocusedEditor instanceof TextareaRenderable)
    const input = setup.renderer.currentFocusedEditor as TextareaRenderable
    await setup.mockInput.pasteBracketedText(filepath)
    await setup.waitForFrame(() => input.plainText === "[Image 1] ")
    const original = prompt.current()

    setup.mockInput.pressKey("-", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === "")
    expect(prompt.current().parts).toEqual([])

    setup.mockInput.pressKey(".", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === "[Image 1] ")
    expect(prompt.current()).toEqual(original)

    setup.mockInput.pressKey("a", { ctrl: true })
    setup.mockInput.pressKey("k", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === "")
    expect(prompt.current().parts).toEqual([])

    setup.mockInput.pressKey("-", { ctrl: true })
    await setup.waitForFrame(() => input.plainText === "[Image 1] ")
    expect(prompt.current()).toEqual(original)
    setup.mockInput.pressEnter()
    await setup.waitForFrame(() => submissions.length === 1)
    expect(submissions).toEqual([{ ...original, delivery: "steer" }])
  } finally {
    setup.renderer.destroy()
  }
})
