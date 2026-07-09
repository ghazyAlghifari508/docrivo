import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const extraction = {
  colors: [{ role: "dominant", value: "rgb(0, 0, 0)" }],
  typography: [{ family: "system-ui" }],
  layout_patterns: ["single page / marketing page"],
  components: ["hero section", "button/CTA"],
  metadata: { pagesAnalyzed: ["https://example.com"], pagesFailed: 0 },
  confidence_score: 0.35,
};

const ndash = String.fromCharCode(0x2013);

const richDesign = `# Example - Style Reference

## Tokens ${ndash} Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Ink | #111111 | --ink | text |
| Canvas | #ffffff | --canvas | background |
| Surface | #f5f5f5 | --surface | panels |
| Accent | #a3e635 | --accent | CTA |
| Muted | #737373 | --muted | secondary text |
| Rule | #e5e5e5 | --rule | borders |
| Depth | #303030 | --depth | dark surface |
| Wash | #dcfff1 | --wash | highlight |

## Tokens ${ndash} Typography
Body and display use system sans with strong hierarchy.

## Tokens ${ndash} Spacing & Shapes
8px spacing rhythm, small radii, hard editorial shadows.

## Components
### 1. Hero Display
### 2. Navigation Header
### 3. Primary CTA
### 4. Card
### 5. Form Input
### 6. Badge
### 7. Footer
### 8. Surface Section

## Do’s and Don’ts
Short model output here.

## Surfaces
| Level | Name | Value | Purpose |
| --- | --- | --- | --- |
| 0 | Canvas | #ffffff | page |

## Elevation
Hard shadow model.

## Imagery
Editorial texture and restrained icons.

## Layout
Centered max-width sections and responsive stacks.

## Agent Prompt Guide
### Quick Color Reference
Use observed tokens only.
### Component Prompts
Model wrote prose instead of list.

## Similar Brands
Linear, Stripe, Vercel.

## Quick Start
### CSS Custom Properties
\`\`\`css
:root { --ink: #111111; }
\`\`\`
### Tailwind v4
\`\`\`css
@theme { --color-ink: #111111; }
\`\`\`

## Limitations & Confidence
Sparse reference; verify manually.

${"Filler sentence for professional depth. ".repeat(420)}
`;

describe("generateDesign", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.stubEnv("AI_MODEL", "");
  });

  it("rejects thin DESIGN.md output", async () => {
    const { generateDesign } = await import("./ai-provider");
    createMock.mockResolvedValue({ choices: [{ message: { content: "# Thin" } }] });

    await expect(generateDesign("https://example.com", extraction)).rejects.toThrow("Generate DESIGN.md gagal");
    expect(createMock).toHaveBeenCalledTimes(3); // initial + 2 rewrites
  });

  it("normalizes and repairs NVIDIA NIM heading variants", async () => {
    const { generateDesign } = await import("./ai-provider");
    createMock.mockResolvedValue({ choices: [{ message: { content: richDesign } }] });

    const result = await generateDesign("https://example.com", extraction);

    expect(result.implementationPrompt).toContain("# Implementation Prompt");
    expect(result.implementationPrompt).toContain(result.designMd);
    expect(result.designMd).toContain("## Tokens - Colors");
    expect(result.designMd).toContain("## Do's and Don'ts");
    expect(result.designMd).toContain("### Example Component Prompts");
    expect(result.designMd).not.toMatch(new RegExp("[\\u2010-\\u2015]"));
    expect(result.designMd).not.toContain("�");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rejects model output cut off by token limit", async () => {
    const { generateDesign } = await import("./ai-provider");
    createMock.mockResolvedValue({ choices: [{ finish_reason: "length", message: { content: richDesign } }] });

    await expect(generateDesign("https://example.com", extraction)).rejects.toThrow("Generate DESIGN.md gagal");
    expect(createMock).toHaveBeenCalledTimes(3); // all configured fallback models rejected as truncated
  });
});
