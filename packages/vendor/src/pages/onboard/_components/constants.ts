import {
  Building02,
  Cake,
  CpuChip01,
  Cube01,
  Dress,
  Food,
  Link01,
  MarkerPin03,
  MedicalCircle,
  Package,
  ShoppingCart01,
  Stars02,
} from "@happilee-app/icons";
import type { StepDef } from "@happilee-app/ui";
import type { OrderStatusConfig } from "./types";

export const WIZARD_STEPS: Omit<StepDef, "state">[] = [
  {
    title: "Business details",
    description: "About your store",
    icon: Building02,
  },
  {
    title: "Commerce type",
    description: "Orders & fulfillment",
    icon: Package,
  },
  {
    title: "Fulfillment details",
    description: "Location & payment",
    icon: MarkerPin03,
  },
  {
    title: "Storefront setup",
    description: "URL & Store template",
    icon: Link01,
  },
];

export const INDUSTRIES = [
  {
    value: "restaurant",
    title: "Restaurant",
    description: "Foods & beverages",
    icon: Food,
  },
  {
    value: "grocery",
    title: "Grocery",
    description: "Daily essentials",
    icon: ShoppingCart01,
  },
  {
    value: "fashion",
    title: "Fashion",
    description: "Apparel & accessories",
    icon: Dress,
  },
  {
    value: "electronics",
    title: "Electronics",
    description: "Gadgets & devices",
    icon: CpuChip01,
  },
  {
    value: "beauty",
    title: "Beauty",
    description: "Cosmetics & care",
    icon: Stars02,
  },
  {
    value: "bakery",
    title: "Bakery",
    description: "Cakes & confectionery",
    icon: Cake,
  },
  {
    value: "pharmacy",
    title: "Pharmacy",
    description: "Medicine & wellness",
    icon: MedicalCircle,
  },
  {
    value: "others",
    title: "Others",
    description: "Custom setup",
    icon: Cube01,
  },
] as const;

export const DEFAULT_ORDER_STATUSES: OrderStatusConfig[] = [
  {
    id: "order-placed",
    label: "Order placed",
    required: true,
    color: "var(--colors-brand-600)",
    displayName: "Order placed",
    active: false,
  },
  {
    id: "confirmed",
    label: "Confirmed",
    required: false,
    color: "var(--colors-green-700)",
    displayName: "Confirmed",
    active: true,
  },
  {
    id: "preparing",
    label: "Preparing",
    required: false,
    color: "var(--colors-amber-700)",
    displayName: "Preparing",
    active: true,
  },
  {
    id: "ready-pickup",
    label: "Ready for pickup",
    required: false,
    color: "var(--colors-violet-600)",
    displayName: "Ready for pickup",
    active: true,
  },
  {
    id: "out-delivery",
    label: "Out for delivery",
    required: false,
    color: "var(--colors-brand-700)",
    displayName: "Out for delivery",
    active: true,
  },
  {
    id: "delivered",
    label: "Delivered",
    required: true,
    color: "var(--colors-green-600)",
    displayName: "Delivered",
    active: false,
  },
  {
    id: "cancelled",
    label: "Cancelled",
    required: true,
    color: "var(--colors-red-700)",
    displayName: "Cancelled",
    active: false,
  },
];

export const DELIVERY_AREAS = [
  { id: "whitefield", label: "Whitefield outlet" },
  { id: "indiranagar", label: "Indiranagar outlet" },
  { id: "koramangala", label: "Koramangala outlet" },
];

export const PAYMENT_GATEWAYS = [
  { id: "razorpay", label: "Razorpay" },
  { id: "stripe", label: "Stripe" },
  { id: "cashfree", label: "Cashfree" },
  { id: "payu", label: "PayU" },
];

export const DEFAULT_FULFILLMENT_CENTRES = [
  {
    id: "whitefield",
    name: "Whitefield outlet",
    address: "42, Whitefield Main Road, Hoodi, Bengaluru 560066",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    pinCode: "560066",
    active: true,
  },
  {
    id: "indiranagar",
    name: "Indiranagar outlet",
    address: "100 Feet Road, Indiranagar, Bengaluru 560038",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    pinCode: "560038",
    active: true,
  },
  {
    id: "koramangala",
    name: "Koramangala outlet",
    address: "5th Block, Koramangala, Bengaluru 560095",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    pinCode: "560095",
    active: false,
  },
];

export const URL_PREFIX = "commerce.happilee.io/stores/";

export const STEP_HEADINGS = [
  {
    step: "Step 1/4",
    title: "Business details",
    description:
      "Tell us about your store so we can tailor your commerce experience.",
  },
  {
    step: "Step 2/4",
    title: "Commerce type",
    description:
      "How do you fulfill customer orders? Pick the model that fits your business.",
  },
  {
    step: "Step 3/4",
    title: "Fulfillment details",
    description: "Add your fulfillment locations and preferred payment method.",
  },
  {
    step: "Step 4/4, Last step!",
    title: "Storefront setup",
    description:
      "Personalize your store's public identity — choose a unique URL and pick a storefront template.",
  },
];

export const HANDLE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
