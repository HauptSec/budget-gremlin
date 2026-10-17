export interface AiProvider {
  suggestCategory(input: {
    merchant: string;
    categories: string[];
  }): Promise<{ category: string; source: "mock" } | null>;
  summarizePeriod(input: {
    income: number;
    spending: number;
  }): Promise<{ text: string; source: "mock" } | null>;
}
export const none: AiProvider = {
  async suggestCategory() {
    return null;
  },
  async summarizePeriod() {
    return null;
  },
};
export const mock: AiProvider = {
  async suggestCategory(i) {
    return i.categories.length
      ? { category: i.categories[0], source: "mock" }
      : null;
  },
  async summarizePeriod(i) {
    return {
      text: `Test fixture: income ${i.income} cents; spending ${i.spending} cents.`,
      source: "mock",
    };
  },
};
