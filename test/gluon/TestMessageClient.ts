import {
    Destination, MessageClient, MessageOptions,
    SlackMessageClient,
} from "@atomist/automation-client/spi/message/MessageClient";

export class TestMessageClient implements MessageClient, SlackMessageClient {
    public textMsg: any;
    public attachments: any;

    public addressUsers(msg: any, users: string | string[], options?: MessageOptions): Promise<any> {
        this.textMsg = msg;
        return Promise.resolve();
    }

    public addressChannels(msg: any, channels: string | string[], options?: MessageOptions): Promise<any> {
        this.textMsg = msg;
        return Promise.resolve();
    }

    public respond(msg: any, options?: MessageOptions): Promise<any> {
        this.textMsg = msg;
        return Promise.resolve();
    }

    public send(msg: any, destinations: Destination | Destination[], options?: MessageOptions): Promise<any> {
        this.textMsg = msg;
        return Promise.resolve();
    }
}
