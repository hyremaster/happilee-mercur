import { ShoppingCart01 } from "@happilee-app/icons";
import {
  Button,
  ButtonGroup,
  ButtonGroupItem,
  InputField,
  UtilityButton,
} from "@happilee-app/ui";
import { ReactNode } from "react";

const PRODUCTS = [
  { id: "p1", name: "Organic Apples", price: "$4.99" },
  { id: "p2", name: "Sourdough Bread", price: "$6.50" },
  { id: "p3", name: "Avocado Oil", price: "$12.00" },
  { id: "p4", name: "Honey Pot", price: "$8.20" },
] as const;

function ProductCard({ name, price }: { name: string; price: string }) {
  return (
    <div className="flex flex-col gap-sm overflow-hidden rounded-lg border border-border-secondary">
      <div className="aspect-square w-full bg-bg-secondary" aria-hidden />
      <div className="flex flex-col gap-xxs px-sm pb-sm">
        <span className="text-sm font-medium text-text-primary">{name}</span>
        <span className="text-sm font-semibold text-text-brand">{price}</span>
      </div>
    </div>
  );
}

export function BrowserFrame({
  children,
  storeHandle = "your-store",
}: {
  children: ReactNode;
  storeHandle?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-secondary">
      <div className="flex items-center gap-md border-b border-border-secondary bg-bg-secondary px-lg py-sm">
        <span
          aria-hidden
          className="inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-fg-error"
        />
        <span
          aria-hidden
          className="inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-fg-warning"
        />
        <span
          aria-hidden
          className="inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-fg-success"
        />
        <div className="min-w-0 flex-1">
          <InputField
            value={`commerce.happilee.io/stores/${storeHandle}`}
            isDisabled
            size="sm"
            aria-label="Store URL"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

export function StorefrontPlaceholder() {
  return (
    <div className="bg-bg-primary">
      <div className="flex items-center justify-between border-b border-border-secondary px-xl py-md">
        <span className="text-lg font-bold text-text-primary">GreenMart</span>
        <div className="flex items-center gap-xl">
          <span className="text-sm text-text-secondary">Shop</span>
          <span className="text-sm text-text-secondary">About</span>
          <UtilityButton
            icon={<ShoppingCart01 />}
            aria-label="Shopping cart"
            variant="tertiary"
            size="sm"
          />
        </div>
      </div>

      <div className="relative mx-0 flex flex-col items-center justify-center gap-lg rounded-none bg-bg-secondary px-xl py-4xl">
        <p className="text-center text-xl font-bold text-text-primary">
          Freshness delivered to your door
        </p>
        <Button hierarchy="secondary" size="sm">
          Shop Collection
        </Button>
      </div>

      <div className="px-xl py-lg">
        <ButtonGroup defaultSelectedKey="all">
          <ButtonGroupItem id="all">All Products</ButtonGroupItem>
          <ButtonGroupItem id="best-sellers">Best Sellers</ButtonGroupItem>
          <ButtonGroupItem id="new-arrivals">New Arrivals</ButtonGroupItem>
          <ButtonGroupItem id="discounts">Discounts</ButtonGroupItem>
          <ButtonGroupItem id="gifts">Gifts</ButtonGroupItem>
        </ButtonGroup>
      </div>

      <div className="grid grid-cols-4 gap-lg px-xl pb-xl">
        {PRODUCTS.map((p) => (
          <ProductCard key={p.id} name={p.name} price={p.price} />
        ))}
      </div>
    </div>
  );
}
