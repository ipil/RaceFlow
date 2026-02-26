type OnboardingCalloutProps = {
  onDismiss: () => void;
};

export default function OnboardingCallout({ onDismiss }: OnboardingCalloutProps) {
  return (
    <div className="onboarding-callout" role="note" aria-live="polite">
      <div className="onboarding-text">
        <strong>Start here:</strong> 1) Choose a map 2) Add waves 3) Press Play
      </div>
      <button type="button" className="onboarding-btn" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
