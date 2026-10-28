export class ScopeQuestion extends Error {
  constructor(
    public question: string,
    public options: { label: string; value: string }[],
  ) {
    super(question);
  }
}
