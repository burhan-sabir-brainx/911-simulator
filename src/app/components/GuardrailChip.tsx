import React, { useState } from "react";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ClockIcon,
} from "@radix-ui/react-icons";
import { GuardrailResultType } from "../types";

export interface ModerationChipProps {
  moderationCategory: string;
  moderationRationale: string;
}

function formatCategory(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function GuardrailChip({
  guardrailResult,
}: {
  guardrailResult: GuardrailResultType;
}) {
  const [expanded, setExpanded] = useState(false);

  // Consolidate state into a single variable: "PENDING", "PASS", or "FAIL"
  const state =
    guardrailResult.status === "IN_PROGRESS"
      ? "PENDING"
      : guardrailResult.category === "NONE"
        ? "PASS"
        : "FAIL";

  // Variables for icon, label, and styling classes based on state
  let IconComponent;
  let label: string;
  let textColorClass: string;
  switch (state) {
    case "PENDING":
      IconComponent = ClockIcon;
      label = "Pending";
      textColorClass = "text-reality-gray";
      break;
    case "PASS":
      IconComponent = CheckCircledIcon;
      label = "Pass";
      textColorClass = "text-[#2cb67d]";
      break;
    case "FAIL":
      IconComponent = CrossCircledIcon;
      label = "Fail";
      textColorClass = "text-red-500";
      break;
    default:
      IconComponent = ClockIcon;
      label = "Pending";
      textColorClass = "text-reality-gray";
  }

  return (
    <div className="text-xs text-foreground">
      <div
        onClick={() => {
          // Only allow toggling the expanded state for PASS/FAIL cases.
          if (state !== "PENDING") {
            setExpanded(!expanded);
          }
        }}
        // Only add pointer cursor if clickable (PASS or FAIL state)
        className={`inline-flex items-center gap-1 rounded ${state !== "PENDING" ? "cursor-pointer" : ""
          }`}
      >
        Bot:
        <div className={`flex items-center gap-1 ${textColorClass}`}>
          <IconComponent /> {label}
        </div>
      </div>
      {/* Container for expandable content */}
      {state !== "PENDING" && guardrailResult.category && guardrailResult.rationale && (
        <div
          className={`overflow-hidden transition-all duration-300 ${expanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
            }`}
        >
          <div className="pt-2 text-xs">
            <strong>
              Moderation Category: {formatCategory(guardrailResult.category)}
            </strong>
            <div>{guardrailResult.rationale}</div>
            {guardrailResult.testText && (
              <blockquote className="mt-1 border-l-2 border-reality-gray pl-2 text-reality-gray">
                {guardrailResult.testText}
              </blockquote>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 