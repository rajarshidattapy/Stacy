import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SegmentedToggleProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function SegmentedToggle({
  options,
  value,
  onChange,
  disabled = false,
  size = "md",
}: SegmentedToggleProps) {
  const selectedIndex = options.indexOf(value);

  return (
    <div
      className={cn(
        "relative inline-flex gap-1 p-1 rounded-full shadow-lg",
        disabled && "opacity-50 cursor-not-allowed",
        size === "sm" ? "h-10" : "h-12"
      )}
      style={{
        background: "linear-gradient(to bottom, #27272a, #18181b)",
      }}
    >
      {/* Active indicator with metallic gradient */}
      {selectedIndex >= 0 && (
        <motion.div
          className="absolute top-1 rounded-full"
          initial={false}
          animate={{
            left: `calc(${(selectedIndex / options.length) * 100}% + 4px)`,
            width: `calc(${100 / options.length}% - 8px)`,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          style={{
            height: "calc(100% - 8px)",
            background: "linear-gradient(135deg, #E6E6E6 0%, #BDBDBD 22%, #6D28D9 55%, #3B0764 100%)",
            boxShadow: "0 2px 8px rgba(109, 40, 217, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
          }}
        />
      )}
      {options.map((option) => (
        <button
          key={option}
          onClick={() => !disabled && onChange(option)}
          disabled={disabled}
          className={cn(
            "relative z-10 flex-1 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer",
            size === "sm" ? "px-4 text-xs min-w-[70px]" : "px-5 text-sm min-w-[80px]",
            disabled && "cursor-not-allowed"
          )}
          style={{
            color: value === option ? "#F4F4F5" : "#666666",
            fontWeight: value === option ? 600 : 400,
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
