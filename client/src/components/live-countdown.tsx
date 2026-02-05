import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveCountdownProps {
  deadline: Date;
  className?: string;
}

export function LiveCountdown({ deadline, className }: LiveCountdownProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (deadline <= now) {
    return (
      <Badge 
        variant="outline" 
        className={cn("text-slate-400 border-white/10 bg-slate-800/60", className)}
        data-testid="badge-voting-closed"
      >
        <Clock className="h-3 w-3 mr-1" />
        Voting closed
      </Badge>
    );
  }

  const totalSeconds = Math.floor((deadline.getTime() - now.getTime()) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isUrgent = totalSeconds < 86400;

  let displayText: string;
  if (days > 0) {
    displayText = `${days}d ${hours}h left`;
  } else if (hours > 0) {
    displayText = `${hours}h ${minutes}m left`;
  } else if (minutes > 0) {
    displayText = `${minutes}m ${seconds}s left`;
  } else {
    displayText = `${seconds}s left`;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono tabular-nums",
        isUrgent
          ? "text-amber-400 border-amber-500/30 bg-amber-900/40 animate-pulse"
          : "text-cyan-400 border-cyan-500/30 bg-cyan-900/40",
        className
      )}
      data-testid="badge-voting-countdown"
    >
      <Clock className="h-3 w-3 mr-1" />
      {displayText}
    </Badge>
  );
}
