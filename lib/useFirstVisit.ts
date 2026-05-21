"use client";

import { useEffect, useState } from "react";

const KEY = "miniklaim.seenOnboarding";

export function useFirstVisit(): {
  showOnboarding: boolean;
  dismiss: () => void;
} {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(KEY);
    if (!seen) queueMicrotask(() => setShowOnboarding(true));
  }, []);

  const dismiss = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(KEY, "1");
      } catch {
        // storage disabled; modal will reappear next visit, acceptable
      }
    }
    setShowOnboarding(false);
  };

  return { showOnboarding, dismiss };
}
