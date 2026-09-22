import type { FulfillmentCentre } from "../types";
import { LocationModal } from "./location-modal";

type EditLocationModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  centre: FulfillmentCentre | null;
  onSaveCentre: (centre: FulfillmentCentre) => void;
};

export const EditLocationModal = ({
  isOpen,
  onOpenChange,
  centre,
  onSaveCentre,
}: EditLocationModalProps) => (
  <LocationModal
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    mode="edit"
    centre={centre}
    onSave={onSaveCentre}
  />
);
