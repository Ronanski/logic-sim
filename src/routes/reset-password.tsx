import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "New password — DCS Logic Studio" },
      { name: "description", content: "Choose a new password for DCS Logic Studio." },
      { property: "og:title", content: "New password — DCS Logic Studio" },
      { property: "og:description", content: "Choose a new password for DCS Logic Studio." },
    ],
  }),
  component: Page,
});
