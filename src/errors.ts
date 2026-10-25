/** An input or usage problem the user can fix; the CLI reports it and exits with code 2. */
export class SpecdiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecdiffError";
  }
}
