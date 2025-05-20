// src/components/Logo.tsx
import { Mountain } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  iconOnly?: boolean;
}

export function Logo({ size = "md", className, iconOnly = false }: LogoProps) {
  const iconSizeClass = size === "sm" ? "h-6 w-6" : size === "md" ? "h-8 w-8" : "h-10 w-10";
  const textSizeClass = size === "sm" ? "text-xl" : size === "md" ? "text-2xl" : "text-3xl";

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Mountain className={`${iconSizeClass} text-primary`} />
      {!iconOnly && <span className={`${textSizeClass} font-bold text-primary`}>{APP_NAME}</span>}
    </div>
  );
}
