import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";

@EventHandler("Receive TeamMemberCreated events", `
subscription TeamMemberCreatedEvent {
  TeamMemberCreatedEvent {
    id
    memberId
    firstName
    lastName
    email
    domainCredentials {
      domain
      username
      password
    }
  }
}
`)
export class TeamMemberCreated implements HandleEvent<any> {

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested TeamMemberCreated event: ${JSON.stringify(event.data)}`);

        return await SuccessPromise;
    }
}
