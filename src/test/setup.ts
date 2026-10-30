import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetStoredValuesForTests } from "@/ui/lib/storedValue";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetStoredValuesForTests();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-calm");
});
