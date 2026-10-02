import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Login";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Log in — DCS Logic Studio" },
      { name: "description", content: "Log in to DCS Logic Studio, the interlock logic builder and simulator." },
      { property: "og:title", content: "Log in — DCS Logic Studio" },
      { property: "og:description", content: "Log in to DCS Logic Studio, the interlock logic builder and simulator." },
    ],
  }),
  component: Page,
});
