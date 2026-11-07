import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WelcomePrototype from "./WelcomePrototype";

export const metadata: Metadata = {
  title: "Drip · First impressions prototype",
  description: "An interactive design preview of Drip’s welcome and account screens, using sample data.",
  robots: { index: false, follow: false },
};

export default function WelcomePrototypePage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <WelcomePrototype />;
}
