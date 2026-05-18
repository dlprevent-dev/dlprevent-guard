/**
 * Tests for src/components/wizard.tsx — the multi-step form wizard primitive.
 *
 * Exercises:
 *   - rail rendering (active / done / pending)
 *   - step body rendering
 *   - canAdvance gating (true / false / string)
 *   - onExit hook (async, success + failure)
 *   - onFinish on the last step
 *   - back navigation
 *   - cancel button (when provided)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Wizard, type WizardStep } from "./wizard";

function basicSteps(): WizardStep[] {
  return [
    { label: "One", title: "Step 1", body: <div>Body 1</div> },
    { label: "Two", title: "Step 2", body: <div>Body 2</div> },
    { label: "Three", title: "Step 3", body: <div>Body 3</div> },
  ];
}

describe("Wizard — rendering", () => {
  it("renders the rail with all step labels", () => {
    render(<Wizard steps={basicSteps()} onFinish={() => {}} />);
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("Three")).toBeInTheDocument();
  });

  it("renders the first step body initially", () => {
    render(<Wizard steps={basicSteps()} onFinish={() => {}} />);
    expect(screen.getByText("Body 1")).toBeInTheDocument();
    expect(screen.queryByText("Body 2")).not.toBeInTheDocument();
  });

  it("renders description when provided", () => {
    const steps: WizardStep[] = [
      { label: "x", title: "T", description: "Help text", body: <div /> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    expect(screen.getByText("Help text")).toBeInTheDocument();
  });

  it("renders cancel button only when onCancel is provided", () => {
    const { rerender } = render(<Wizard steps={basicSteps()} onFinish={() => {}} />);
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    rerender(<Wizard steps={basicSteps()} onFinish={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("hides Back on the first step", () => {
    render(<Wizard steps={basicSteps()} onFinish={() => {}} />);
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });
});

describe("Wizard — navigation", () => {
  it("advances to next step on Next click", async () => {
    render(<Wizard steps={basicSteps()} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Body 2")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("goes Back to prior step", async () => {
    render(<Wizard steps={basicSteps()} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Body 2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(screen.getByText("Body 1")).toBeInTheDocument());
  });

  it("shows Finish label on the last step + calls onFinish", async () => {
    const onFinish = vi.fn();
    render(<Wizard steps={basicSteps()} onFinish={onFinish} finishLabel="Submit it" />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Body 2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Body 3")).toBeInTheDocument());
    const finish = screen.getByRole("button", { name: /submit it/i });
    fireEvent.click(finish);
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it("calls onCancel from any step", () => {
    const onCancel = vi.fn();
    render(<Wizard steps={basicSteps()} onFinish={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("Wizard — canAdvance gating", () => {
  it("disables Next when canAdvance returns false", () => {
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div />, canAdvance: () => false },
      { label: "y", title: "T2", body: <div /> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("shows inline error when canAdvance returns a string", () => {
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div />, canAdvance: () => "Provider key required" },
      { label: "y", title: "T2", body: <div /> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    expect(screen.getByText("Provider key required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("enables Next when canAdvance returns true", () => {
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div />, canAdvance: () => true },
      { label: "y", title: "T2", body: <div /> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
  });

  it("survives canAdvance throwing", () => {
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div />, canAdvance: () => { throw new Error("boom"); } },
      { label: "y", title: "T2", body: <div /> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    // Default: thrown → treat as not-advanceable. No crash.
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});

describe("Wizard — onExit hook", () => {
  it("awaits onExit before advancing", async () => {
    const onExit = vi.fn().mockResolvedValue(undefined);
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div>Body A</div>, onExit },
      { label: "y", title: "T2", body: <div>Body B</div> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Body B")).toBeInTheDocument());
  });

  it("shows exit-hook error and stays on current step", async () => {
    const steps: WizardStep[] = [
      {
        label: "x", title: "T", body: <div>Body A</div>,
        onExit: async () => { throw new Error("Test connection failed: 401"); },
      },
      { label: "y", title: "T2", body: <div>Body B</div> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Test connection failed: 401/i)).toBeInTheDocument());
    // Did NOT advance.
    expect(screen.getByText("Body A")).toBeInTheDocument();
  });
});

describe("Wizard — onEnter hook", () => {
  it("calls onEnter when arriving at a step (not on initial mount)", async () => {
    const onEnter = vi.fn();
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div>A</div> },
      { label: "y", title: "T2", body: <div>B</div>, onEnter },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1));
  });

  it("calls onEnter when going back to a step", async () => {
    const onEnter1 = vi.fn();
    const steps: WizardStep[] = [
      { label: "x", title: "T", body: <div>A</div>, onEnter: onEnter1 },
      { label: "y", title: "T2", body: <div>B</div> },
    ];
    render(<Wizard steps={steps} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("B")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(onEnter1).toHaveBeenCalledTimes(1));
  });
});
