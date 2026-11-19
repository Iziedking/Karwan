import { textWords } from '../llm/keywords.js';

/// The words of a request, the way find matches them against people's work:
/// lower case, in any script, three letters or more.
export const keywordsOf = (text: string): string[] => textWords(text);
