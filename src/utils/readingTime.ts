export interface ReadingStats {
  words: number;
  minutes: number;
}

const AVERAGE_WORDS_PER_MINUTE = 200;

const WORD_REGEX = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function markdownToCountableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ");
}

export function estimateReadingStats(
  markdown: string | undefined,
): ReadingStats {
  const cleaned = markdownToCountableText(markdown ?? "");
  const words = cleaned.match(WORD_REGEX)?.length ?? 0;
  const minutes = Math.max(1, Math.ceil(words / AVERAGE_WORDS_PER_MINUTE));

  return {
    words,
    minutes,
  };
}
