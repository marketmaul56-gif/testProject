import type { PgCompetencyAuthority } from "../../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService } from "../../../packages/modules/verification/src/application/authority.ts";
import { PgRuntimeVerificationQueue } from "../../../packages/modules/verification/src/infrastructure/pg-runtime-queue.ts";
import { authorityDeliveryCounter, dependencyFailureCounter, withSpan } from "../../../packages/platform/observability/src/telemetry.ts";
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
    return withSpan("authority.delivery", { "authority.event_type": name }, async () => {
      try {
        const result = name === "verification.requested"
          ? await this.processVerificationRequest(eventId)
          : await this.processPassedVerification(eventId);
        authorityDeliveryCounter.add(1, {
          "authority.event_type": name,
          "authority.result": result.verificationErrors > 0 ? "system_error" : "processed",
        });
        return result;
      } catch (error) {
        dependencyFailureCounter.add(1, { dependency: name === "verification.requested" ? "verifier" : "evidence_persistence" });
        authorityDeliveryCounter.add(1, { "authority.event_type": name, "authority.result": "delivery_failure" });
        throw error;
      }
    });
  }

  async runOnce(): Promise<WorkerIterationResult> {
    let verificationProcessed = 0;
    let verificationErrors = 0;
    let evidenceProcessed = 0;
    let deliveryFailures = 0;

    for (const event of await this.queue.listVerificationRequests()) {
      try {
        const result = await this.processVerificationRequest(event.eventId);
        verificationProcessed += result.verificationProcessed;
        verificationErrors += result.verificationErrors;
      } catch {
        deliveryFailures += 1;
      }
    }

    for (const eventId of await this.queue.listPassedEvents()) {
      try {
        const result = await this.processPassedVerification(eventId);
        evidenceProcessed += result.evidenceProcessed;
      } catch {
        deliveryFailures += 1;
      }
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
