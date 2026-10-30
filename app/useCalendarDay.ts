"use client";
import { useEffect, useState } from "react";
import { dateInZone } from "@/lib/payment-reminders";

export function useCalendarDay() {
  const [day, setDay] = useState(() => dateInZone());
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setDay(dateInZone()); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return day;
}
