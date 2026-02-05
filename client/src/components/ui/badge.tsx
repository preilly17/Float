import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-slate-900",
  {
    variants: {
      variant: {
        default:
          "border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20",
        secondary:
          "border-violet-400/30 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20",
        destructive:
          "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20",
        outline: "border-white/20 text-slate-300 hover:bg-white/5",
        success:
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20",
        warning:
          "border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
