import { useState } from "react";
import { Building02, Mail01, Plus } from "@happilee-app/icons";
import { Button, InputField, ProgressSteps } from "@happilee-app/ui";
import { DashboardLayout } from "@components/layout/dashboard-layout";

export const SamplePage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log({ name, email });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-8">
        <div>
          <h1 className="text-display-xs font-semibold text-text-primary">
            Happilee design system
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sample page using @happilee-app/ui components.
          </p>
        </div>

        <ProgressSteps
          steps={[
            {
              title: "Account",
              description: "Profile details",
              state: "complete",
              icon: Plus,
            },
            {
              title: "Store",
              description: "Business info",
              state: "current",
              icon: Building02,
            },
            {
              title: "Review",
              description: "Confirm & launch",
              state: "incomplete",
              icon: Mail01,
            },
          ]}
          orientation="horizontal"
          className="w-full max-w-3xl"
        />

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-md flex-col gap-4"
        >
          <InputField
            label="Name"
            placeholder="Enter your name"
            value={name}
            onChange={setName}
          />
          <InputField
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
          />
          <div className="flex gap-3 pt-2">
            <Button hierarchy="primary" size="md" type="submit" iconLeading={<Plus />}>
              Submit
            </Button>
            <Button hierarchy="secondary" size="md" type="button">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};
