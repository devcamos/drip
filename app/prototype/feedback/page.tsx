import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FeedbackPrototype from "./FeedbackPrototype";

export const metadata: Metadata = {
  title: "Drip · Feedback design prototype",
  description: "Discuss Drip’s proposed feedback journey and C4 architecture using sample data.",
  robots: { index: false, follow: false },
};

export default function FeedbackPrototypePage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <FeedbackPrototype />;
}
