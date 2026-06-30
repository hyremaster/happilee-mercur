import { Mail01 } from "@happilee-app/icons";
import { Button, InputField, Modal, Textarea } from "@happilee-app/ui";
import { HardcodedMapPreview } from "../shared/hardcoded-map-preview";

type AddLocationModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AddLocationModal = ({ isOpen, onOpenChange }: AddLocationModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Add new location"
      subtitle="Outlets and warehouses you fulfill from."
      size="xl"
      footer={
        <>
          <Button hierarchy="secondary" size="md" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button hierarchy="primary" size="md" onPress={() => onOpenChange(false)}>
            Add location
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xl">
        <InputField
          label="Location name"
          isRequired
          placeholder="e.g. Whitefield outlet"
          iconLeading={<Mail01 />}
        />
        <Textarea
          label="Address"
          isRequired
          placeholder="123 Commerce Street, Floor 4"
          rows={3}
        />

        <div className="grid grid-cols-4 gap-lg">
          <InputField label="Country" placeholder="India" />
          <InputField label="State" placeholder="Maharashtra" />
          <InputField label="City" placeholder="Mumbai" />
          <InputField label="Pincode" placeholder="400001" />
        </div>

        <div className="flex flex-col gap-sm">
          <span className="text-sm font-medium text-text-secondary">
            Pin location on map
          </span>
          <HardcodedMapPreview />
          <span className="text-sm text-text-tertiary">Lat 12.9698, Lng 77.7500</span>
        </div>
      </div>
    </Modal>
  );
};
