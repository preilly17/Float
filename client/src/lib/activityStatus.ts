import type { ActivityWithDetails, TripWithDetails } from "@shared/schema";
import type { ActivityStatusDescriptor } from "@/components/ui/status-badge";
import { getActivityDisplayStatus } from "@/components/ui/status-badge";

export interface ActivityWithEnrichedStatus extends ActivityWithDetails {
  statusDescriptor: ActivityStatusDescriptor;
}

/**
 * Derives a complete status descriptor for an activity, including status, type, counts, and deadline.
 * Used across calendar view, member schedule, and other activity displays for consistency.
 */
export function deriveActivityStatusDescriptor(
  activity: ActivityWithDetails,
  currentUserId: string | null,
): ActivityStatusDescriptor {
  const invites = activity.invites ?? [];
  const currentUserInvite = currentUserId
    ? invites.find((inv) => inv.userId === currentUserId)
    : null;

  const status = getActivityDisplayStatus({
    type: activity.type,
    inviteStatus: currentUserInvite?.status,
    status: activity.status ?? undefined,
    votingDeadline: activity.votingDeadline,
  });

  const acceptedCount = invites.filter((inv) => inv.status === "accepted").length;
  const pendingCount = invites.filter((inv) => inv.status === "pending").length;
  const declinedCount = invites.filter((inv) => inv.status === "declined").length;
  const totalCount = invites.length;

  return {
    status,
    type: "activity",
    count: {
      accepted: acceptedCount,
      pending: pendingCount,
      declined: declinedCount,
      total: totalCount,
    },
    deadline: activity.votingDeadline,
  };
}

/**
 * Determines if an activity needs attention from the current user.
 * Includes: pending invites, proposals with approaching deadlines (< 48h), or waitlisted status.
 */
export function activityNeedsAttention(
  activity: ActivityWithDetails,
  currentUserId: string | null,
): boolean {
  if (!currentUserId) return false;

  const invites = activity.invites ?? [];
  const currentUserInvite = invites.find((inv) => inv.userId === currentUserId);

  // Pending invite needs response
  if (currentUserInvite?.status === "pending") {
    return true;
  }

  // Waitlisted might need attention
  if (currentUserInvite?.status === "waitlisted") {
    return true;
  }

  // Proposal with approaching voting deadline (< 48 hours)
  // Only show deadline warning if user hasn't already decided
  if (activity.type === "PROPOSE" && activity.votingDeadline && currentUserInvite) {
    const deadline = new Date(activity.votingDeadline);
    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    // If deadline is in the future and less than 48 hours away
    if (hoursUntilDeadline > 0 && hoursUntilDeadline < 48) {
      return true;
    }
  }

  return false;
}

/**
 * Determines if an activity is a "locked plan" (confirmed/scheduled).
 * Only includes SCHEDULED activities with accepted invites.
 */
export function isLockedPlan(
  activity: ActivityWithDetails,
  currentUserId: string | null,
): boolean {
  const activityType = (activity.type ?? "").toString().toUpperCase();
  if (activityType !== "SCHEDULED") {
    return false;
  }

  // If we have a current user, check if they accepted
  if (currentUserId) {
    const invites = activity.invites ?? [];
    const currentUserInvite = invites.find((inv) => inv.userId === currentUserId);
    
    // Only count as locked if user accepted
    return currentUserInvite?.status === "accepted";
  }

  // If no current user, any scheduled activity is considered locked
  return true;
}

/**
 * Enriches a list of activities with status descriptors for efficient rendering.
 */
export function enrichActivitiesWithStatus(
  activities: ActivityWithDetails[],
  currentUserId: string | null,
): ActivityWithEnrichedStatus[] {
  return activities.map((activity) => ({
    ...activity,
    statusDescriptor: deriveActivityStatusDescriptor(activity, currentUserId),
  }));
}
