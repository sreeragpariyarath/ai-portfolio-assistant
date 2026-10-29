// gemini-embedding-2 has no task_type parameter. Google's docs say to put the task in the text instead:
//   document: "title: {title} | text: {content}" (title "none" when there is no title)
//   query:    "task: search result | query: {content}"
// Both the ingest hash and the Gemini client use these, so a change here re-embeds everything.

export function documentInput(title: string, content: string): string {
  return `title: ${title === "" ? "none" : title} | text: ${content}`;
}

export function queryInput(question: string): string {
  return `task: search result | query: ${question}`;
}
