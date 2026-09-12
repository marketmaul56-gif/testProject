import type { PgCompetencyAuthority } from "../../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService } from "../../../packages/modules/verification/src/application/authority.ts";
import { PgRuntimeVerificationQueue } from "../../../packages/modules/verification/src/infrastructure/pg-runtime-queue.ts";

export type WorkerIterationResult = Readonly<{
  verificationProcessed: number;
  verificationErrors: number;
  evidenceProcessed: number;
  deliveryFailures: number;
}>;

type CompetencyProcessor = Pick<PgCompetencyAuthority, "processPassedVerificationEvent">;

export class AuthorityWorker {
  private readonly queue: PgRuntimeVerificationQueue;
  private readonly dispatcher: VerificationDispatcherService;
  private readonly competency: CompetencyProcessor;

  constructor(queue: PgRuntimeVerificationQueue, dispatcher: VerificationDispatcherService, competency: CompetencyProcessor) {
    this.queue = queue;
    this.dispatcher = dispatcher;
    this.competency = competency;
  }

  async runOnce(): Promise<WorkerIterationResult> {
    let verificationProcessed = 0;
    let verificationErrors = 0;
    let evidenceProcessed = 0;
    let deliveryFailures = 0;

    for (const event of await this.queue.listVerificationRequests()) {
      try {
        const input = await this.queue.prepare(event);
        const result = await this.dispatcher.verify(input);
        await this.queue.markVerificationRequestProcessed(event.eventId);
        verificationProcessed += 1;
        if (result.outcome === "ERROR") verificationErrors += 1;
      } catch {
        await this.queue.noteDeliveryFailure(event.eventId);
        deliveryFailures += 1;
      }
    }

    for (const eventId of await this.queue.listPassedEvents()) {
      try {
        await this.competency.processPassedVerificationEvent(eventId);
        evidenceProcessed += 1;
      } catch {
        await this.queue.noteDeliveryFailure(eventId);
        deliveryFailures += 1;
      }
    }

    return Object.freeze({ verificationProcessed, verificationErrors, evidenceProcessed, deliveryFailures });
  }
}
