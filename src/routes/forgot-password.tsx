import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/ForgotPassword";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Forgot password — DCS Logic Studio" },
      { name: "description", content: "Reset your DCS Logic Studio password." },
      { property: "og:title", content: "Forgot password — DCS Logic Studio" },
      { property: "og:description", content: "Reset your DCS Logic Studio password." },
    ],
  }),
  component: Page,
});
