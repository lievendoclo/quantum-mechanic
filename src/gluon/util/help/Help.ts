import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    Parameter,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import uuid = require("uuid");
import {QMConfig} from "../../../config/QMConfig";
import {handleQMError, ResponderMessageClient} from "../shared/Error";
import {HelpCategory} from "./HelpCategory";

@CommandHandler("Help regarding subatomic commands", QMConfig.subatomic.commandPrefix + " help")
export class Help implements HandleCommand<HandlerResult> {

    @Parameter({
        description: "Option selected",
        required: false,
    })
    public selectedOption: string;

    @Parameter({
        description: "Previous option selected for menu purpose",
        required: false,
    })
    public prevSelectedOption: string;

    @Parameter({
        description: "Option description selected",
        required: false,
    })
    public selectedDescription: string;

    @Parameter({
        description: "Class of command to be run",
        required: false,
    })
    public commandClassName: string;

    @Parameter({
        description: "correlation id of the message that invoked this command",
        required: false,
    })
    public correlationId: string;

    public optionsAttachments: any = [];
    public optionFolders = [
        new HelpCategory("Bitbucket", "Bitbucket commands that control bitbucket project configuration and access controls.", "bitbucket"),
        new HelpCategory("Jenkins", "Jenkins commands that allow the user to control builds and jenkins configuration.", "jenkins"),
        new HelpCategory("Member", "Member commands allow you to manage Subatomic members. These include editing Slack details, onboarding, editing user roles and adding members to teams.", "member"),
        new HelpCategory("Package", "Package commands are related to managing applications and libraries. These include deployment, build, prod promotion and image management.", "package"),
        new HelpCategory("Project", "Project commands provide management capabilities around individual Projects and their associated resources. This includes environment management, application and library creation, jenkins and bitbucket configuration.", "project"),
        new HelpCategory("Team", "Team commands allow you to manage your Subatomic team. These include team membership, team projects and DevOps environment configuration.", "team"),
        new HelpCategory("Other", "All other general commands", "other"),
    ];
    public commands: any = [];
    public absaColors = [
        "#ff780f", "#fa551e",
        "#f52d28", "#dc0032",
        "#be0028", "#aa052d",
        "#960528", "#f05a7d",
        "#f0325a", "#af144b",
        "#870a3c", "#640032",
        "#500a28", "#000000",
    ];
    public colorCount = 0;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            if (this.correlationId === undefined) {
                this.correlationId = uuid();
            }
            logger.info(`Category: ${this.selectedOption} clicked`);
            if (this.selectedOption === undefined) {
                return await this.displayCategories(ctx);
            } else if (this.selectedOption.startsWith(QMConfig.subatomic.commandPrefix)) {
                return this.displayCommandToBeRun(ctx);
            } else {
                return await this.displayCommands(ctx);
            }

        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private folderOptions(option: string, optionDescription: string) {
        this.optionsAttachments.push({
            text: `*${optionDescription}*`,
            fallback: "",
            color: this.absaColors[this.colorCount],
            mrkdwn_in: ["text"],
            actions: [
                buttonForCommand(
                    {
                        text: option,
                        style: "primary",
                    },
                    new Help(), {selectedOption: option, correlationId: this.correlationId}),
            ],
        });
    }

    private commandOptions(commandMetadata: any, command: any) {
        this.optionsAttachments.push({
            text: `\`${commandMetadata.intent}\` - ${commandMetadata.description}`,
            fallback: "",
            color: this.absaColors[this.colorCount],
            mrkdwn_in: ["text"],
            actions: [
                buttonForCommand(
                    {
                        text: commandMetadata.intent,
                        style: "primary",
                    },
                    new Help(), {
                        selectedOption: `${commandMetadata.intent}`,
                        selectedDescription: `${commandMetadata.description}`,
                        commandClassName: command.prototype.__name,
                        prevSelectedOption: this.selectedOption,
                        correlationId: this.correlationId,
                    }),
            ],
        });
    }

    private finalMenuStep() {
        this.optionsAttachments.push({
            text: "",
            fallback: "",
            color: this.absaColors[this.colorCount],
            mrkdwn_in: ["text"],
            actions: [
            buttonForCommand(
                {
                    text: "Run Command",
                    style: "primary",
                },
                this.optionFolders[0].findCommandByName(this.commandClassName), {correlationId: this.correlationId}),
            ],
        },
        );
        this.colorCount++;
        this.returnMenuButton(this.prevSelectedOption, undefined, this.prevSelectedOption);
    }

    private returnMenuButton(option: string, desc: string, menu: string) {
        this.optionsAttachments.push({
            text: "",
            fallback: "",
            color: this.absaColors[this.colorCount],
            mrkdwn_in: ["text"],
            actions: [
                buttonForCommand(
                    {
                        text: `:arrow_left: Return to ${menu} menu`,
                    },
                    new Help(), {
                        selectedOption: option,
                        selectedDescription: desc,
                        correlationId: this.correlationId,
                    }),
            ],
        });
    }

    private async displayCategories(ctx: HandlerContext) {
        for (const option of this.optionFolders) {
            this.folderOptions(option.getHelpName(), option.getHelpDescription());
            this.colorCount++;
        }
        return await ctx.messageClient.respond({
            text: "What would you like to do?",
            attachments: this.optionsAttachments,
        }, {id: this.correlationId});
    }

    private async displayCommands(ctx: HandlerContext) {
        this.optionsAttachments = [];
        for (const commandClass of this.optionFolders) {
            if (commandClass.getHelpName() === this.selectedOption) {
                this.commands = commandClass.findListOfCommands(commandClass.getHelpName().toLowerCase());
                for (const command of this.commands) {
                    this.commandOptions(this.getCommandHandlerMetadata(command.prototype), command);
                    this.colorCount++;
                }
                break;
            }
        }
        this.returnMenuButton(undefined, undefined, "Main");

        return await ctx.messageClient.respond({
            text: `*${this.selectedOption}*`,
            attachments: this.optionsAttachments,
        }, {id: this.correlationId});
    }

    private async displayCommandToBeRun(ctx: HandlerContext) {
        this.finalMenuStep();
        return await ctx.messageClient.respond({
            text: `\`${this.selectedOption}\` - ${this.selectedDescription}`,
            attachments: this.optionsAttachments,
        }, {id: this.correlationId});
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }

    private getCommandHandlerMetadata(commandHandlerPrototype: any): { intent: string, description: string } {
        return {
            intent: commandHandlerPrototype.__intent,
            description: commandHandlerPrototype.__description,
        };
    }
}
