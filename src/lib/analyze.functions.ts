import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROMPT, SCHEMA } from "./analyze-prompt.server";

// Reads an uploaded logic drawing with AI and returns { title, nodes, wires, warnings }.
export const analyzeDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ image: z.string().startsWith("data:image/").max(15_000_000) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: PROMPT },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
        tools: [
          { type: "function", name: "logic_graph", description: "Return the logic graph", parameters: SCHEMA, strict: false },
        ],
        tool_choice: { type: "function", name: "logic_graph" },
      }),
    });
    if (res.status === 429) throw new Error("Too many requests — please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are used up for this workspace.");
    if (!res.ok) throw new Error(`Could not read the drawing (${res.status}).`);
    const json = await res.json();
    const call = (json.output ?? []).find((o: { type?: string }) => o.type === "function_call");
    const args = call?.arguments;
    if (!args) throw new Error("Could not read the drawing.");
    return JSON.parse(args) as { title?: string; nodes: Array<Record<string, string | number>>; wires: Array<{ from: string; to: string; to_port?: number }>; warnings?: string[] };
  });
