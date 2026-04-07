import { execFileSync } from "child_process";

export interface Worktree {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export class WorktreeManager {
  list(cwd: string): Worktree[] {
    try {
      const output = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf-8" });
      return this.parse(output);
    } catch {
      return [];
    }
  }

  create(opts: {
    cwd: string;
    path: string;
    branch: string;
    newBranch?: boolean;
  }): Worktree | null {
    try {
      const args = ["worktree", "add"];
      if (opts.newBranch) args.push("-b");
      args.push(opts.path, opts.branch);
      execFileSync("git", args, { cwd: opts.cwd, encoding: "utf-8" });
      return this.list(opts.cwd).find((w) => w.path === opts.path) || null;
    } catch (e) {
      console.error("worktree create failed:", e);
      return null;
    }
  }

  remove(opts: { cwd: string; path: string; force?: boolean }): boolean {
    try {
      const args = ["worktree", "remove"];
      if (opts.force) args.push("--force");
      args.push(opts.path);
      execFileSync("git", args, { cwd: opts.cwd, encoding: "utf-8" });
      return true;
    } catch {
      return false;
    }
  }

  private parse(output: string): Worktree[] {
    const result: Worktree[] = [];
    const entries = output.trim().split("\n\n");

    for (const entry of entries) {
      const lines = entry.split("\n");
      const wt: Partial<Worktree> = {};

      for (const line of lines) {
        if (line.startsWith("worktree ")) wt.path = line.slice(9);
        else if (line.startsWith("HEAD ")) wt.head = line.slice(5);
        else if (line.startsWith("branch ")) wt.branch = line.slice(7).replace("refs/heads/", "");
      }

      if (wt.path) {
        wt.isMain = result.length === 0;
        result.push(wt as Worktree);
      }
    }

    return result;
  }
}
