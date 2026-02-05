import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plane, Hotel, MapPin, Utensils, CheckCircle, X } from "lucide-react";

interface SearchReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingType: 'flight' | 'hotel' | 'activity' | 'restaurant';
  bookingData?: {
    type: 'flight' | 'hotel' | 'activity' | 'restaurant';
    data: any;
    tripId: number;
  } | null;
  onYes: () => void;
  onNo: () => void;
}

export function SearchReturnModal({
  isOpen,
  onClose,
  bookingType,
  bookingData,
  onYes,
  onNo,
}: SearchReturnModalProps) {
  const getIcon = () => {
    switch (bookingType) {
      case 'flight': return <Plane className="h-6 w-6 text-cyan-500" />;
      case 'hotel': return <Hotel className="h-6 w-6 text-violet-500" />;
      case 'activity': return <MapPin className="h-6 w-6 text-emerald-500" />;
      case 'restaurant': return <Utensils className="h-6 w-6 text-amber-500" />;
    }
  };

  const getTitle = () => {
    switch (bookingType) {
      case 'flight': return 'Back from flight search';
      case 'hotel': return 'Back from accommodation search';
      case 'activity': return 'Back from activity search';
      case 'restaurant': return 'Back from restaurant search';
    }
  };

  const getQuestion = () => {
    switch (bookingType) {
      case 'flight': return 'Did you book or schedule a flight?';
      case 'hotel': return 'Did you book or schedule an accommodation?';
      case 'activity': return 'Did you book or schedule an activity?';
      case 'restaurant': return 'Did you make a restaurant reservation?';
    }
  };

  const getDescription = () => {
    switch (bookingType) {
      case 'flight': return "If you booked a flight, we'll help you add the details to your trip.";
      case 'hotel': return "If you booked accommodation, we'll help you add the details to your trip.";
      case 'activity': return "If you booked an activity, we'll help you add the details to your trip.";
      case 'restaurant': return "If you made a reservation, we'll help you add the details to your trip.";
    }
  };

  const handleYes = () => {
    onYes();
    onClose();
  };

  const handleNo = () => {
    onNo();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm font-medium text-center">
            {getQuestion()}
          </p>
          
          <div className="flex gap-3">
            <Button 
              onClick={handleYes}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Yes
            </Button>
            <Button 
              variant="outline"
              onClick={handleNo}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              No
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
