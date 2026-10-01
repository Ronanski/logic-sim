import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LogicSim — Control Logic Simulator" },
      { name: "description", content: "Import engineering drawings and simulate control logic." },
      { property: "og:title", content: "LogicSim — Control Logic Simulator" },
      { property: "og:description", content: "Import engineering drawings and simulate control logic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/simulate" });
  },
});

