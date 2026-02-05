import { describe, expect, test } from "bun:test";
import { completeMulticodex } from "../src/completion";

describe("completion", () => {
  test("suggests top-level commands", async () => {
    const res = await completeMulticodex({ words: ["multicodex", "a"], cword: 1, current: "a" });
    expect(res).toContain("accounts");
    expect(res).toContain("add");
  });

  test("suggests accounts subcommands", async () => {
    const res = await completeMulticodex({
      words: ["multicodex", "accounts", "r"],
      cword: 2,
      current: "r",
    });
    expect(res).toContain("remove");
    expect(res).toContain("rename");
  });

  test("suggests limits command", async () => {
    const res = await completeMulticodex({ words: ["multicodex", "l"], cword: 1, current: "l" });
    expect(res).toContain("limits");
  });

  test("suggests limits flags", async () => {
    const res = await completeMulticodex({ words: ["multicodex", "limits", "--"], cword: 3, current: "--" });
    expect(res).toContain("--ttl");
    expect(res).toContain("--no-cache");
    expect(res).toContain("--json");
    expect(res).toContain("--account");
  });

  test("suggests status flags", async () => {
    const res = await completeMulticodex({ words: ["multicodex", "status", "--"], cword: 3, current: "--" });
    expect(res).toContain("--json");
    expect(res).toContain("--account");
  });

  test("suggests use flags", async () => {
    const res = await completeMulticodex({ words: ["multicodex", "use", "--"], cword: 3, current: "--" });
    expect(res).toContain("--force");
    expect(res).toContain("--json");
  });

  test("suggests shells for completion command", async () => {
    const res = await completeMulticodex({
      words: ["multicodex", "completion", ""],
      cword: 2,
      current: "",
    });
    expect(res).toEqual(["bash", "fish", "zsh"]);
  });

  test("suggests completion flags", async () => {
    const res = await completeMulticodex({
      words: ["multicodex", "completion", "zsh", "--"],
      cword: 4,
      current: "--",
    });
    expect(res).toContain("--install");
  });
});
