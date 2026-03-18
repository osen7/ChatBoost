export function extractThreadIdFromPath(pathname: string, marker: string): string | null {
  const escaped = escapeRegExp(marker);
  const match = pathname.match(new RegExp(`/${escaped}/([^/]+)`));
  return match?.[1] ?? null;
}

export function buildPathThreadId(pathname: string, search: string): string {
  return `path:${pathname}${search || ""}`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
