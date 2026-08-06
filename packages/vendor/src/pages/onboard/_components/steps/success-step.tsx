import { ArrowRight, CheckCircle } from "@happilee-app/icons";
import { Button, FeaturedIcon, ProgressSteps } from "@happilee-app/ui";
import { useNavigate } from "react-router-dom";
import { WIZARD_STEPS } from "../constants";

export const SuccessStep = () => {
  const navigate = useNavigate();

  const steps = WIZARD_STEPS.map((step) => ({
    ...step,
    state: "complete" as const,
  }));

  return (
    <>
      <div className="flex w-full shrink-0 flex-col items-center gap-2xl px-4xl pt-3xl">
        <ProgressSteps
          steps={steps}
          orientation="horizontal"
          className="w-full max-w-[1008px]"
        />
        <div className="w-full border-t border-border-secondary" role="separator" />
      </div>

      <div className="flex w-full flex-1 items-center justify-center py-4xl">
        <div className="flex max-w-[480px] flex-col items-center gap-3xl text-center">
          <FeaturedIcon icon={<CheckCircle />} color="success" theme="light" size="lg" />

          <div className="flex flex-col items-center gap-xs">
            <span className="text-xl font-semibold text-text-primary">
              Storefront created successfully!
            </span>
            <span className="text-sm text-text-tertiary">
              Your storefront is added to the workspace, Keep shipping.
            </span>
          </div>

          <Button
            hierarchy="ghost"
            size="md"
            iconTrailing={<ArrowRight />}
            onPress={() => navigate("/stores")}
          >
            Go to workspace
          </Button>
        </div>
      </div>
    </>
  );
};
