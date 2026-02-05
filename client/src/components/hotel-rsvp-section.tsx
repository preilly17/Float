import { useRsvp } from "@/hooks/use-rsvp";
import { RsvpStatus } from "@/components/rsvp-status";

interface HotelRsvpSectionProps {
  hotelId: number;
  currentUserId: string;
}

export function HotelRsvpSection({ hotelId, currentUserId }: HotelRsvpSectionProps) {
  const { rsvps, isLoading, accept, decline, isResponding } = useRsvp({
    type: "hotel",
    itemId: hotelId,
    enabled: hotelId > 0,
  });

  if (isLoading || rsvps.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <RsvpStatus
        rsvps={rsvps}
        currentUserId={currentUserId}
        onAccept={accept}
        onDecline={decline}
        isLoading={isResponding}
      />
    </div>
  );
}
