import { createFileRoute } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import Editor from "@/views/Editor";

export const Route = createFileRoute("/diagram/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Diagram editor — DCS Logic Studio" },
      { name: "description", content: "Edit and simulate an interlock logic diagram." },
      { property: "og:title", content: "Diagram editor — DCS Logic Studio" },
      { property: "og:description", content: "Edit and simulate an interlock logic diagram." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Editor />
    </RequireAuth>
  ),
});
