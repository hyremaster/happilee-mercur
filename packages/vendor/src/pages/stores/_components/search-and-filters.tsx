import { FilterLines, SearchLg } from "@happilee-app/icons";
import { Button, InputField } from "@happilee-app/ui";

export const SearchAndFilters = () => {
  return (
    <div className="flex items-center gap-md">
      <InputField
        label=""
        aria-label="Search your store"
        placeholder="Search your store"
        iconLeading={<SearchLg />}
        size="md"
        className="w-[320px]"
      />
      <Button hierarchy="secondary" size="md" iconLeading={<FilterLines />}>
        Filters
      </Button>
    </div>
  );
};
