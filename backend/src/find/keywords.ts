/// The words of a request, the way find matches them against people's work:
/// lower case, letters and digits only, three letters or more.
export const keywordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
