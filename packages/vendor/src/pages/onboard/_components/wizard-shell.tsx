import { ArrowLeft, ArrowRight } from "@happilee-app/icons";
import { Button, ProgressSteps } from "@happilee-app/ui";
import { ReactNode } from "react";
import { WIZARD_STEPS } from "./constants";
import type { WizardStep } from "./types";

type WizardShellProps = {
  currentStep: WizardStep;
  stepIndex: number;
  heading: { step: string; title: string; description: string };
  children: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueIcon?: ReactNode;
  isContinueDisabled?: boolean;
  showBack?: boolean;
};

export const WizardShell = ({
  currentStep,
  stepIndex,
  heading,
  children,
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueIcon = <ArrowRight />,
  isContinueDisabled = false,
  showBack = true,
}: WizardShellProps) => {
  const steps = WIZARD_STEPS.map((step, i) => ({
    ...step,
    state:
      currentStep >= 5 || i < stepIndex
        ? ("complete" as const)
        : i === stepIndex
          ? ("current" as const)
          : ("incomplete" as const),
  }));

  return (
    <div className="flex flex-1 flex-col items-center gap-4xl overflow-y-auto px-4xl pb-4xl pt-3xl">
      <div className="flex w-full flex-col items-center gap-2xl">
        <ProgressSteps
          steps={steps}
          orientation="horizontal"
          className="w-full max-w-[1008px]"
        />
        <div className="w-full border-t border-border-secondary" role="separator" />
      </div>

      <div className="flex w-full max-w-[888px] flex-col items-start gap-4xl">
        <div className="flex w-full flex-col">
          <span className="text-sm font-medium leading-5 text-text-brand">
            {heading.step}
          </span>
          <span className="text-xl font-semibold leading-8 text-text-primary">
            {heading.title}
          </span>
          <span className="text-sm font-normal leading-5 text-text-tertiary">
            {heading.description}
          </span>
        </div>

        {children}

        <div className="flex w-full items-center justify-end gap-lg rounded-md bg-bg-primary p-lg">
          {showBack && (
            <Button
              hierarchy="secondary"
              size="md"
              iconLeading={<ArrowLeft />}
              onPress={onBack}
            >
              Back
            </Button>
          )}
          {onContinue && (
            <Button
              hierarchy="primary"
              size="md"
              iconTrailing={continueIcon}
              isDisabled={isContinueDisabled}
              onPress={onContinue}
            >
              {continueLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
