import {HandlerContext, HandlerResult} from "@atomist/automation-client";
import {OCService} from "../../services/openshift/OCService";
import {QMError} from "../shared/Error";
import {createMenu} from "../shared/GenericMenu";
import {getDevOpsEnvironmentDetails} from "../team/Teams";

export async function setOpenshiftTemplate(
    ctx: HandlerContext,
    commandHandler: OpenshiftTemplateSetter,
    selectionMessage: string = "Please select an Openshift template",
) {

    if (commandHandler.ocService === undefined) {
        throw new QMError(`setOpenshiftTemplate commandHandler requires the ocService parameter to be defined`);
    }

    if (commandHandler.teamName === undefined) {
        throw new QMError(`setOpenshiftTemplate commandHandler requires the teamName parameter to be defined`);
    }

    const namespace = getDevOpsEnvironmentDetails(commandHandler.teamName).openshiftProjectId;
    const templates = await commandHandler.ocService.getSubatomicAppTemplates(namespace);
    return await createMenu(ctx, templates.map(template => {
            return {
                value: template.metadata.name,
                text: template.metadata.name,
            };
        }),
        commandHandler,
        selectionMessage,
        "Select a template",
        "openshiftTemplate");
}

export interface OpenshiftTemplateSetter {
    ocService: OCService;
    teamName: string;
    openshiftTemplate: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}

export async function setImageName(
    ctx: HandlerContext,
    commandHandler: ImageNameSetter,
    selectionMessage: string = "Please select an image") {
    if (commandHandler.ocService === undefined) {
        throw new QMError(`setImageName commandHandler requires ocService parameter to be defined`);
    }

    const images = await commandHandler.ocService.getSubatomicImageStreamTags();
    return await createMenu(
        ctx,
        images.map(image => {
            return {
                value: image.metadata.name,
                text: image.metadata.name,
            };
        }),
        commandHandler,
        selectionMessage,
        "Select Image",
        "imageName");
}

export interface ImageNameSetter {
    ocService: OCService;
    imageName: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}
