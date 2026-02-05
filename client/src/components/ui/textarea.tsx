import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-base text-slate-900 dark:text-white ring-offset-white dark:ring-offset-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.07] hover:border-slate-400 dark:hover:border-white/20",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
