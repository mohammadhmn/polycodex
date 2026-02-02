import { describe, expect, test } from "bun:test";
import { completePolycodex } from "../src/completion";

describe("completion", () => {
  test("suggests top-level commands", async () => {
    const res = await completePolycodex({ words: ["polycodex", "a"], cword: 1, current: "a" });
    expect(res).toContain("accounts");
    expect(res).toContain("add");
  });

  test("suggests accounts subcommands", async () => {
    const res = await completePolycodex({
      words: ["polycodex", "accounts", "r"],
      cword: 2,
      current: "r",
    });
    expect(res).toContain("remove");
    expect(res).toContain("rename");
  });

  test("suggests limits command", async () => {
    const res = await completePolycodex({ words: ["polycodex", "l"], cword: 1, current: "l" });
    expect(res).toContain("limits");
  });

  test("suggests shells for completion command", async () => {
    const res = await completePolycodex({
      words: ["polycodex", "completion", ""],
      cword: 2,
      current: "",
    });
    expect(res).toEqual(["bash", "fish", "zsh"]);
  });
});
