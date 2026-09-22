import { FilterLines, SearchLg } from "@happilee-app/icons";
import { Button, InputField } from "@happilee-app/ui";

type SearchAndFiltersProps = {
  value: string;
  onChange: (value: string) => void;
};

export const SearchAndFilters = ({ value, onChange }: SearchAndFiltersProps) => {
  return (
    <div className="flex items-center gap-md">
      <InputField
        label=""
        aria-label="Search your store"
        placeholder="Search your store"
        iconLeading={<SearchLg />}
        size="md"
        className="w-[320px]"
        value={value}
        onChange={onChange}
      />
      <Button hierarchy="secondary" size="md" iconLeading={<FilterLines />}>
        Filters
      </Button>
    </div>
  );
};
