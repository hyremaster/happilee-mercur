import type { FulfillmentCentre } from "../types";
import { LocationModal } from "./location-modal";

type AddLocationModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCentre: (centre: FulfillmentCentre) => void;
};

export const AddLocationModal = ({
  isOpen,
  onOpenChange,
  onAddCentre,
}: AddLocationModalProps) => (
  <LocationModal
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    mode="add"
    onSave={onAddCentre}
  />
);
