import { Check, X, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RsvpStatus = "pending" | "accepted" | "declined";

export interface RsvpUser {
  userId: string;
  status: RsvpStatus;
  respondedAt?: string | null;
  user?: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
  };
}

interface RsvpStatusProps {
  rsvps: RsvpUser[];
  currentUserId: string;
  onAccept: () => void;
  onDecline: () => void;
  isLoading?: boolean;
  compact?: boolean;
}

export function RsvpStatus({
  rsvps,
  currentUserId,
  onAccept,
  onDecline,
  isLoading = false,
  compact = false,
}: RsvpStatusProps) {
  const currentUserRsvp = rsvps.find((r) => r.userId === currentUserId);
  const acceptedCount = rsvps.filter((r) => r.status === "accepted").length;
  const pendingCount = rsvps.filter((r) => r.status === "pending").length;
  const declinedCount = rsvps.filter((r) => r.status === "declined").length;
  const totalCount = rsvps.length;

  const getUserDisplayName = (rsvp: RsvpUser) => {
    if (!rsvp.user) return "Unknown";
    if (rsvp.user.firstName && rsvp.user.lastName) {
      return `${rsvp.user.firstName} ${rsvp.user.lastName}`;
    }
    return rsvp.user.username || "Unknown";
  };

  if (!currentUserRsvp) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {currentUserRsvp.status === "pending" ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={onAccept}
              disabled={isLoading}
              className="h-7 px-2 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
            >
              <Check className="h-3 w-3 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDecline}
              disabled={isLoading}
              className="h-7 px-2 text-xs bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
            >
              <X className="h-3 w-3 mr-1" />
              Decline
            </Button>
          </div>
        ) : (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              currentUserRsvp.status === "accepted" &&
                "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
              currentUserRsvp.status === "declined" &&
                "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
            )}
          >
            {currentUserRsvp.status === "accepted" ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Going
              </>
            ) : (
              <>
                <X className="h-3 w-3 mr-1" />
                Not Going
              </>
            )}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="h-3 w-3" />
          {acceptedCount}/{totalCount}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>
            {acceptedCount} going, {pendingCount} pending
            {declinedCount > 0 && `, ${declinedCount} declined`}
          </span>
        </div>
      </div>

      {currentUserRsvp.status === "pending" && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
            <Clock className="h-4 w-4" />
            You're invited! Will you be joining?
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isLoading}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Check className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDecline}
              disabled={isLoading}
              className="flex-1 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <X className="h-4 w-4 mr-2" />
              Decline
            </Button>
          </div>
        </div>
      )}

      {currentUserRsvp.status !== "pending" && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg",
            currentUserRsvp.status === "accepted" &&
              "bg-emerald-500/10 border border-emerald-500/30",
            currentUserRsvp.status === "declined" &&
              "bg-rose-500/10 border border-rose-500/30"
          )}
        >
          {currentUserRsvp.status === "accepted" ? (
            <>
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                You're going!
              </span>
            </>
          ) : (
            <>
              <X className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
                You declined this invitation
              </span>
            </>
          )}
          <div className="ml-auto flex gap-1">
            {currentUserRsvp.status === "accepted" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDecline}
                disabled={isLoading}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-rose-600"
              >
                Change to Decline
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAccept}
                disabled={isLoading}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-emerald-600"
              >
                Change to Accept
              </Button>
            )}
          </div>
        </div>
      )}

      {rsvps.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Responses
          </p>
          <div className="flex flex-wrap gap-1">
            {rsvps.map((rsvp) => (
              <Badge
                key={rsvp.userId}
                variant="outline"
                className={cn(
                  "text-xs",
                  rsvp.status === "accepted" &&
                    "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                  rsvp.status === "declined" &&
                    "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
                  rsvp.status === "pending" &&
                    "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                )}
              >
                {rsvp.userId === currentUserId ? "You" : getUserDisplayName(rsvp)}
                {rsvp.status === "accepted" && (
                  <Check className="h-3 w-3 ml-1" />
                )}
                {rsvp.status === "declined" && <X className="h-3 w-3 ml-1" />}
                {rsvp.status === "pending" && (
                  <Clock className="h-3 w-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
