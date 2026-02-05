import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RsvpUser } from "@/components/rsvp-status";

type RsvpType = "flight" | "hotel" | "restaurant";

interface UseRsvpOptions {
  type: RsvpType;
  itemId: number;
  enabled?: boolean;
}

interface RsvpResponse {
  id: number;
  userId: string;
  status: "pending" | "accepted" | "declined";
  respondedAt: string | null;
  user?: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
  };
}

export function useRsvp({ type, itemId, enabled = true }: UseRsvpOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const endpoint = `/api/${type}s/${itemId}/rsvps`;
  const responseEndpoint = `/api/${type}s/${itemId}/rsvp`;
  const queryKey = [endpoint];

  const rsvpsQuery = useQuery<RsvpResponse[]>({
    queryKey,
    enabled: enabled && itemId > 0,
  });

  const respondMutation = useMutation({
    mutationFn: async (status: "accepted" | "declined") => {
      const res = await apiRequest(responseEndpoint, {
        method: "POST",
        body: { status },
      });
      return res.json();
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: status === "accepted" ? "RSVP Accepted" : "RSVP Declined",
        description:
          status === "accepted"
            ? "You've confirmed your attendance"
            : "You've declined this invitation",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update your RSVP",
        variant: "destructive",
      });
    },
  });

  const rsvps: RsvpUser[] = (rsvpsQuery.data ?? []).map((rsvp) => ({
    userId: rsvp.userId,
    status: rsvp.status,
    respondedAt: rsvp.respondedAt,
    user: rsvp.user,
  }));

  return {
    rsvps,
    isLoading: rsvpsQuery.isLoading,
    isError: rsvpsQuery.isError,
    accept: () => respondMutation.mutate("accepted"),
    decline: () => respondMutation.mutate("declined"),
    isResponding: respondMutation.isPending,
  };
}
