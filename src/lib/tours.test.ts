/**
 * Tests for src/lib/tours.ts — the tour configurations.
 *
 * Focus areas:
 *   - Both tours have the right shape and meaningful step counts
 *   - Selectors look like valid data-tour attribute references
 *   - Navigate paths point at real /dashboard routes
 *   - Registry is type-safe and complete
 */

import { describe, it, expect } from "vitest";
import { PLATFORM_TOUR, SETUP_TOUR, TOUR_REGISTRY } from "./tours";

describe("PLATFORM_TOUR", () => {
  it("has a meaningful step count (covers all major surfaces)", () => {
    // Goal: walk every major dashboard page. Fewer than 8 means we missed
    // a page; more than 20 means the tour is too long.
    expect(PLATFORM_TOUR.length).toBeGreaterThanOrEqual(8);
    expect(PLATFORM_TOUR.length).toBeLessThanOrEqual(20);
  });

  it("every step has a non-empty title + body", () => {
    for (const step of PLATFORM_TOUR) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.body.length).toBeGreaterThan(10);
    }
  });

  it("every selector is a valid CSS selector that looks like a data-tour ref or a basic tag/class", () => {
    for (const step of PLATFORM_TOUR) {
      // Either matches [data-tour="…"] OR is a simple selector like main / .foo / #bar
      const isDataTour = /^\[data-tour="[\w-]+"\]$/.test(step.selector);
      const isSimple = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(step.selector) ||
                       /^[.#][a-zA-Z][a-zA-Z0-9_-]*$/.test(step.selector);
      expect(isDataTour || isSimple,
        `selector "${step.selector}" should be a [data-tour="…"] ref or a simple element/class selector`,
      ).toBe(true);
    }
  });

  it("every navigate path starts with /dashboard", () => {
    for (const step of PLATFORM_TOUR) {
      if (step.navigate) {
        expect(step.navigate.startsWith("/dashboard"),
          `navigate "${step.navigate}" should be under /dashboard`,
        ).toBe(true);
      }
    }
  });

  it("includes navigation to all the major dashboard pages", () => {
    const navigated = new Set(
      PLATFORM_TOUR.filter((s) => s.navigate).map((s) => s.navigate!),
    );
    // The platform tour should hit at least these primary pages
    const mustVisit = ["/dashboard", "/dashboard/connect", "/dashboard/keys",
                       "/dashboard/policies", "/dashboard/threats",
                       "/dashboard/logs", "/dashboard/playground",
                       "/dashboard/alerts"];
    for (const route of mustVisit) {
      expect(navigated.has(route),
        `platform tour should visit ${route}`,
      ).toBe(true);
    }
  });
});

describe("SETUP_TOUR", () => {
  it("is shorter than the platform tour (it's a setup flow, not an explainer)", () => {
    expect(SETUP_TOUR.length).toBeLessThanOrEqual(PLATFORM_TOUR.length);
    expect(SETUP_TOUR.length).toBeGreaterThanOrEqual(3);
  });

  it("starts by pointing at the Connect nav link (entry point)", () => {
    expect(SETUP_TOUR[0].selector).toContain("nav-connect");
  });

  it("ends with Logs (so users know where their first request lands)", () => {
    const last = SETUP_TOUR[SETUP_TOUR.length - 1];
    expect(last.navigate).toBe("/dashboard/logs");
  });
});

describe("TOUR_REGISTRY", () => {
  it("has both platform-v1 and setup-v1 entries", () => {
    expect(TOUR_REGISTRY["platform-v1"]).toBeDefined();
    expect(TOUR_REGISTRY["setup-v1"]).toBeDefined();
  });

  it("each entry has label + description + steps + id", () => {
    for (const id of ["platform-v1", "setup-v1"] as const) {
      const cfg = TOUR_REGISTRY[id];
      expect(cfg.id).toBe(id);
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.description.length).toBeGreaterThan(0);
      expect(cfg.steps.length).toBeGreaterThan(0);
    }
  });

  it("platform-v1 maps to PLATFORM_TOUR + setup-v1 maps to SETUP_TOUR", () => {
    expect(TOUR_REGISTRY["platform-v1"].steps).toBe(PLATFORM_TOUR);
    expect(TOUR_REGISTRY["setup-v1"].steps).toBe(SETUP_TOUR);
  });
});
