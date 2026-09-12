import type { PgCompetencyAuthority } from "../../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService } from "../../../packages/modules/verification/src/application/authority.ts";
import { PgRuntimeVerificationQueue } from "../../../packages/modules/verification/src/infrastructure/pg-runtime-queue.ts";
import type { AuthorityJobName } from "../../../packages/platform/queue/src/bullmq-authority-transport.ts";

export type WorkerIterationResult = Readonly<{
  verificationProcessed: number;
  verificationErrors: number;
  evidenceProcessed: number;
  deliveryFailures: number;
}>;

type CompetencyProcessor = Pick<PgCompetencyAuthority, "processPassedVerificationEvent">;

const emptyResult = (): WorkerIterationResult => Object.freeze({
  verificationProcessed: 0,
  verificationErrors: 0,
  evidenceProcessed: 0,
  deliveryFailures: 0,
});

export class AuthorityWorker {
  private readonly queue: PgRuntimeVerificationQueue;
  private readonly dispatcher: VerificationDispatcherService;
  private readonly competency: CompetencyProcessor;

  constructor(queue: PgRuntimeVerificationQueue, dispatcher: VerificationDispatcherService, competency: CompetencyProcessor) {
    this.queue = queue;
    this.dispatcher = dispatcher;
    this.competency = competency;
  }

  async processJob(name: AuthorityJobName, eventId: string): Promise<WorkerIterationResult> {
    if (name === "verification.requested") return this.processVerificationRequest(eventId);
    return this.processPassedVerification(eventId);
  }

  async runOnce(): Promise<WorkerIterationResult> {
    let verificationProcessed = 0;
    let verificationErrors = 0;
    let evidenceProcessed = 0;
    let deliveryFailures = 0;

    for (const event of await this.queue.listVerificationRequests()) {
      const result = await this.processVerificationRequest(event.eventId);
      verificationProcessed += result.verificationProcessed;
      verificationErrors += result.verificationErrors;
      evidenceProcessed += result.evidenceProcessed;
      deliveryFailures += result.deliveryFailures;
    }

    for (const eventId of await this.queue.listPassedEvents()) {
      const result = await this.processPassedVerification(eventId);
      verificationProcessed += result.verificationProcessed;
      verificationErrors += result.verificationErrors;
      evidenceProcessed += result.evidenceProcessed;
      deliveryFailures += result.deliveryFailures;
    }

    return Object.freeze({ verificationProcessed, verificationErrors, evidenceProcessed, deliveryFailures });
  }

  private async processVerificationRequest(eventId: string): Promise<WorkerIterationResult> {
    const event = await this.queue.getVerificationRequest(eventId);
    if (!event) return emptyResult();
    try {
      const input = await this.queue.prepare(event);
      const result = await this.dispatcher.verify(input);
      await this.queue.markVerificationRequestProcessed(event.eventId);
      return Object.freeze({
        verificationProcessed: 1,
        verificationErrors: result.outcome === "ERROR" ? 1 : 0,
        evidenceProcessed: 0,
        deliveryFailures: 0,
      });
    } catch (error) {
      await this.queue.noteDeliveryFailure(event.eventId);
      throw error;
    }
  }

  private async processPassedVerification(eventId: string): Promise<WorkerIterationResult> {
    try {
      const result = await this.competency.processPassedVerificationEvent(eventId);
      return Object.freeze({
        verificationProcessed: 0,
        verificationErrors: 0,
        evidenceProcessed: result.alreadyProcessed ? 0 : 1,
        deliveryFailures: 0,
      });
    } catch (error) {
      await this.queue.noteDeliveryFailure(eventId);
      throw error;
    }
  }
}
