import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Register";

export const Route = createFileRoute("/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Create account — DCS Logic Studio" },
      { name: "description", content: "Create a DCS Logic Studio account to build and simulate interlock logic." },
      { property: "og:title", content: "Create account — DCS Logic Studio" },
      { property: "og:description", content: "Create a DCS Logic Studio account to build and simulate interlock logic." },
    ],
  }),
  component: Page,
});
