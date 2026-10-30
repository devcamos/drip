import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HoldingsPrototype from "./HoldingsPrototype";

export const metadata: Metadata = {
  title: "Drip · Account cards prototype",
  description: "An interactive Drip design preview using sample holdings.",
  robots: { index: false, follow: false },
};

export default function PrototypePage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <HoldingsPrototype />;
}
