import { describe, expect, it } from "vitest";
import { overflowingItemIds } from "@/lib/overflow-toolbar";

describe("overflowingItemIds", () => {
  it("keeps everything when there is room", () => {
    expect(
      overflowingItemIds(
        [
          { id: "a", width: 40 },
          { id: "b", width: 40 },
        ],
        200,
        28,
      ),
    ).toEqual([]);
  });

  it("never hides sticky items", () => {
    expect(
      overflowingItemIds(
        [
          { id: "name", sticky: true, width: 80 },
          { id: "bold", width: 28 },
          { id: "italic", width: 28 },
          { id: "cite", width: 28 },
        ],
        160,
        28,
        4,
      ),
    ).toEqual(["italic", "cite"]);
  });

  it("hides all flexible items when only sticky fits", () => {
    expect(
      overflowingItemIds(
        [
          { id: "name", sticky: true, width: 100 },
          { id: "bold", width: 28 },
        ],
        110,
        28,
      ),
    ).toEqual(["bold"]);
  });
});
