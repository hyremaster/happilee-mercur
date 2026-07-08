import { MarkerPin03, SearchLg } from "@happilee-app/icons";
import { InputField } from "@happilee-app/ui";

export const HardcodedMapPreview = () => {
  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-xl border border-border-secondary bg-bg-secondary">
      <div className="absolute inset-0">
        <div className="absolute left-0 right-0 top-[18%] h-[4px] bg-bg-primary/80" />
        <div className="absolute left-0 right-0 top-[42%] h-[3px] bg-bg-primary/70" />
        <div className="absolute left-0 right-0 top-[68%] h-[4px] bg-bg-primary/80" />
        <div className="absolute bottom-0 left-[22%] top-0 w-[3px] bg-bg-primary/70" />
        <div className="absolute bottom-0 left-[55%] top-0 w-[4px] bg-bg-primary/80" />
        <div className="absolute bottom-0 right-[18%] top-0 w-[3px] bg-bg-primary/70" />
        <div className="absolute left-[8%] top-[12%] h-[28%] w-[30%] rounded-sm bg-green-100/60" />
        <div className="absolute bottom-[10%] right-[6%] h-[22%] w-[24%] rounded-sm bg-green-100/50" />
        <span className="absolute left-[10%] top-[8%] text-[10px] font-medium uppercase tracking-wide text-text-tertiary/80">
          Thiruvananthapuram
        </span>
        <span className="absolute left-[28%] top-[52%] text-[9px] text-text-tertiary/70">
          Kowdiar
        </span>
        <span className="absolute right-[12%] top-[36%] text-[9px] text-text-tertiary/70">
          Vellayambalam
        </span>
      </div>

      <div className="absolute left-lg right-lg top-lg z-10">
        <InputField
          aria-label="Search for an address or drag the pin"
          placeholder="Search for an address or drag the pin"
          iconLeading={<SearchLg />}
          className="bg-bg-primary shadow-xs"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <MarkerPin03
          size={40}
          className="-mt-lg text-fg-brand drop-shadow-md"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
