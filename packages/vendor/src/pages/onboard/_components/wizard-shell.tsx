import { ArrowLeft, ArrowRight } from "@happilee-app/icons";
import { Button, ProgressSteps } from "@happilee-app/ui";
import { ReactNode } from "react";
import { WIZARD_STEPS } from "./constants";

type WizardShellProps = {
  stepIndex: number;
  isComplete?: boolean;
  children: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueIcon?: ReactNode;
  isContinueDisabled?: boolean;
  showBack?: boolean;
};

export const WizardShell = ({
  stepIndex,
  isComplete = false,
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
      isComplete || i < stepIndex
        ? ("complete" as const)
        : i === stepIndex
          ? ("current" as const)
          : ("incomplete" as const),
  }));

  return (
    <>
      <div className="flex w-full flex-col items-center gap-2xl px-4xl pt-3xl">
        <ProgressSteps
          steps={steps}
          orientation="horizontal"
          className="w-full max-w-[1008px]"
        />
        <div
          className="w-full border-t border-border-secondary"
          role="separator"
        />
      </div>

      <div className="flex w-full max-w-[888px] flex-col items-start gap-4xl pb-4xl">
        {children}

        {(showBack || onContinue) && (
          <div className="flex w-full items-center justify-end gap-lg rounded-md bg-bg-primary p-lg">
            {showBack && onBack && (
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
        )}
      </div>
    </>
  );
};
