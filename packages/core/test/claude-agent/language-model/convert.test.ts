import { describe, expect, test } from "bun:test"
import { ConvertToClaudeMessage } from "@opencode/core/claude-agent/language-model/convert-to-claude-message"
import { ClaudeSystemPrompt } from "@opencode/core/claude-agent/language-model/system-prompt"
import type { LanguageModelV3Prompt } from "@ai-sdk/provider"

describe("Claude conversions", () => {
  test("utility calls keep system instructions separate from conversation content and omit thinking", () => {
    const prompt: LanguageModelV3Prompt = [
      { role: "system", content: "Summarize this conversation." },
      { role: "system", content: "Use one sentence." },
      { role: "user", content: [{ type: "text", text: "First question" }] },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Private reasoning" },
          { type: "text", text: "First answer" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "Follow-up" }] },
    ]
    expect(ClaudeSystemPrompt.utility(prompt)).toBe("Summarize this conversation.\n\nUse one sentence.")
    expect(ConvertToClaudeMessage.content(prompt)).toEqual([
      { type: "text", text: "<user>" },
      { type: "text", text: "First question" },
      { type: "text", text: "</user>" },
      { type: "text", text: "<assistant>" },
      { type: "text", text: "First answer" },
      { type: "text", text: "</assistant>" },
      { type: "text", text: "<user>" },
      { type: "text", text: "Follow-up" },
      { type: "text", text: "</user>" },
    ])
  })

  test("preserves byte/base64/URL image and PDF attachments", () => {
    const bytes = new Uint8Array([1, 2, 3])
    const blocks = ConvertToClaudeMessage.content([
      {
        role: "user",
        content: [
          { type: "text", text: "/compact @README.md are literal text" },
          { type: "file", mediaType: "image/png", data: bytes },
          { type: "file", mediaType: "application/pdf", data: "cGRm" },
          { type: "file", mediaType: "image/jpeg", data: new URL("https://example.com/photo.jpg") },
        ],
      },
    ])
    expect(blocks).toEqual([
      { type: "text", text: "/compact @README.md are literal text" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "cGRm" } },
      { type: "image", source: { type: "url", url: "https://example.com/photo.jpg" } },
    ])
  })

  test("the preset receives tool context, explicit roles and complete instruction files", () => {
    const catalog =
      "# Code Mode\n\nUse execute and search.\n\n## Available tools\n\n- accounts (1 tool) // Customer account tools.\nUse the account ID from search.\n  - tools.accounts.search(): Promise<unknown>\n- example (1 tool)\n  - tools.example.read({\n      path: string,\n    }): Promise<string>\n"
    const mcp = '<mcp_instructions>\n  <server name="example">Use its documented paths.</server>\n</mcp_instructions>'
    const skills =
      "Skills provide specialized instructions and workflows for specific tasks.\n<available_skills><skill>fixture</skill></available_skills>"
    const instructions =
      "Instructions from: AGENTS.md\nPROJECT-RULE\n\n## Style\nKeep it readable.\n\nInstructions from: https://example.com/guide.md\nCONFIGURED-RULE"
    const system = ClaudeSystemPrompt.make(
      [
        {
          role: "system",
          content: [
            "GENERIC-OPENCode-PROMPT",
            catalog,
            mcp,
            skills,
            instructions,
            "Today's date: Sat Oct 17 2026\n\n<env>OPENCode-ENVIRONMENT</env>",
          ].join("\n\n"),
        },
      ],
      true,
      "CUSTOM-ROLE",
    )
    expect(system.preset).toBe("claude_code")
    expect(system.snapshot).toBe(false)
    expect(system.append).toContain(catalog.trim())
    expect(system.append).toContain(mcp)
    expect(system.append).toContain(skills)
    expect(system.append).not.toContain("GENERIC-OPENCode-PROMPT")
    expect(system.append).toContain("CUSTOM-ROLE")
    expect(system.append).toContain(instructions)
    expect(system.append).not.toContain("OPENCode-ENVIRONMENT")
  })
})
