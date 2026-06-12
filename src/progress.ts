/**
 * Minimal dependency-free progress reporter.
 * - TTY: redraws a single in-place bar on stderr.
 * - Non-TTY (cron/pipe): prints a plain line every `logEvery` items, so logs
 *   stay readable without thousands of carriage returns.
 */
export class Progress {
  private done = 0;
  private readonly isTty: boolean;

  constructor(
    private readonly total: number,
    private readonly label: string,
    private readonly logEvery = 25,
  ) {
    this.isTty = Boolean(process.stderr.isTTY);
  }

  tick(detail: string, failed = false): void {
    this.done++;
    if (this.total === 0) return;

    if (this.isTty) {
      if (failed) process.stderr.write("\r\x1b[2K  ! " + truncate(detail, 100) + "\n");
      this.draw(detail);
    } else if (failed || this.done === this.total || this.done % this.logEvery === 0) {
      const mark = failed ? "!" : "·";
      process.stderr.write(`  ${mark} [${this.done}/${this.total}] ${truncate(detail, 80)}\n`);
    }
  }

  private draw(detail: string): void {
    const width = 24;
    const filled = Math.round((this.done / this.total) * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);
    const pct = String(Math.round((this.done / this.total) * 100)).padStart(3);
    const line = `  ${this.label} [${bar}] ${pct}% ${this.done}/${this.total}  ${truncate(detail, 50)}`;
    process.stderr.write("\r\x1b[2K" + truncate(line, (process.stderr.columns || 120) - 1));
  }

  done_(): void {
    if (this.isTty && this.total > 0) process.stderr.write("\n");
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
