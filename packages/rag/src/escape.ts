// Keeps record and chat text from closing or forging the delimiters around it in a prompt.
export function escapeText(value: string): string {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
