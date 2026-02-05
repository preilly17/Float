import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldLabelProps {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}

export function FieldLabel({ htmlFor, children, required, className }: FieldLabelProps) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn("text-sm font-medium text-slate-800", className)}
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </Label>
  );
}

interface HelperTextProps {
  children: ReactNode;
  className?: string;
}

export function HelperText({ children, className }: HelperTextProps) {
  return (
    <p className={cn("text-xs text-neutral-500 mt-1", className)}>
      {children}
    </p>
  );
}
