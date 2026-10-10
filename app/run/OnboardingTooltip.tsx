"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";

type Step = "gps" | "start" | "capture" | "finish";

export function OnboardingTooltip() {
  const { t } = useLocale();
  const [currentStep, setCurrentStep] = useState<Step | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has seen onboarding
    const hasSeenOnboarding = localStorage.getItem("onboarding_seen");
    if (hasSeenOnboarding || dismissed) return;

    // Show first tooltip after 1 second
    const timer = setTimeout(() => {
      setCurrentStep("gps");
    }, 1000);

    return () => clearTimeout(timer);
  }, [dismissed]);

  const handleNext = () => {
    if (currentStep === "gps") setCurrentStep("start");
    else if (currentStep === "start") setCurrentStep("capture");
    else if (currentStep === "capture") setCurrentStep("finish");
    else if (currentStep === "finish") {
      localStorage.setItem("onboarding_seen", "true");
      setCurrentStep(null);
      setDismissed(true);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("onboarding_seen", "true");
    setCurrentStep(null);
    setDismissed(true);
  };

  if (!currentStep) return null;

  const content = {
    gps: {
      title: t("onboarding.gps.title"),
      body: t("onboarding.gps.body"),
      position: "top",
    },
    start: {
      title: t("onboarding.start.title"),
      body: t("onboarding.start.body"),
      position: "bottom",
    },
    capture: {
      title: t("onboarding.capture.title"),
      body: t("onboarding.capture.body"),
      position: "center",
    },
    finish: {
      title: t("onboarding.finish.title"),
      body: t("onboarding.finish.body"),
      position: "bottom",
    },
  };

  const step = content[currentStep];

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Tooltip */}
      <div className="pointer-events-auto relative z-10 mx-4 max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">{step.title}</h3>
          <span className="text-xs text-zinc-500">
            {["gps", "start", "capture", "finish"].indexOf(currentStep) + 1}/4
          </span>
        </div>
        <p className="mb-4 text-sm text-zinc-600">{step.body}</p>
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="flex-1 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
          >
            {t("onboarding.skip")}
          </button>
          <button
            onClick={handleNext}
            className="flex-1 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
          >
            {currentStep === "finish" ? t("onboarding.gotit") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
