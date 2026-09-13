export class RequestConflictError extends Error {
  constructor(message = "The idempotency key was reused with different request input.") {
    super(message);
    this.name = "RequestConflictError";
  }
}
