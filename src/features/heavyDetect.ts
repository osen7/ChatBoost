export function detectHeavyMessage(contentEl: HTMLElement): boolean {
  const height = contentEl.getBoundingClientRect().height;
  const codeBlocks = contentEl.querySelectorAll("pre").length;
  const images = contentEl.querySelectorAll("img").length;
  const tables = contentEl.querySelectorAll("table").length;
  const textLen = contentEl.textContent?.length ?? 0;
  const inlineCodeCount = contentEl.querySelectorAll("code").length;
  const longInlineCode = textLen > 4000 && inlineCodeCount > 20;

  return height > 1200 || codeBlocks >= 2 || images > 0 || tables > 0 || longInlineCode;
}
