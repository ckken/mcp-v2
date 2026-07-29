import { expect, test } from "bun:test";
import { cn } from "../src/lib/utils";

test("shadcn class utility resolves conflicting Tailwind utilities", () => {
  expect(cn("px-2 text-sm", false && "hidden", "px-4")).toBe("text-sm px-4");
});
