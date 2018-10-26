import {logger} from "@atomist/automation-client";
import * as XmlBuilder from "xmlbuilder";
import {QMConfig} from "../../../config/QMConfig";

export function getJenkinsBitbucketAccessCredential(teamDevOpsProjectId: string) {
    return {
        "": "0",
        "credentials": {
            scope: "GLOBAL",
            id: `${teamDevOpsProjectId}-bitbucket`,
            username: QMConfig.subatomic.bitbucket.auth.username,
            password: QMConfig.subatomic.bitbucket.auth.password,
            description: `${teamDevOpsProjectId}-bitbucket`,
            $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
        },
    };
}

export function getJenkinsBitbucketAccessCredentialXML(teamDevOpsProjectId) {
    const value = XmlBuilder.begin()
        .ele("com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl", {plugin: "credentials@2.1.18"})
        .ele("scope", "GLOBAL").up()
        .ele("id", `${teamDevOpsProjectId}-bitbucket`).up()
        .ele("description", `${teamDevOpsProjectId}-bitbucket`).up()
        .ele("username", `${QMConfig.subatomic.bitbucket.auth.username}`).up()
        .ele("password", `${QMConfig.subatomic.bitbucket.auth.password}`).up()
        .end({pretty: true});

    logger.debug("Built XML Credential: \n" + value);
    return value;
}

export function getJenkinsBitbucketProjectCredential(projectId: string) {
    return {
        "": "0",
        "credentials": {
            scope: "GLOBAL",
            id: `${projectId}-bitbucket`,
            username: QMConfig.subatomic.bitbucket.auth.username,
            password: QMConfig.subatomic.bitbucket.auth.password,
            description: `${projectId}-bitbucket`,
            $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
        },
    };
}

export function getJenkinsNexusCredential() {
    return {
        "": "0",
        "credentials": {
            scope: "GLOBAL",
            id: "nexus-base-url",
            secret: `${QMConfig.subatomic.nexus.baseUrl}/content/repositories/`,
            description: "Nexus base URL",
            $class: "org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl",
        },
    };
}

export function getJenkinsDockerCredential() {
    return {
        "": "0",
        "credentials": {
            scope: "GLOBAL",
            id: "docker-registry-ip",
            secret: `${QMConfig.subatomic.openshiftNonProd.dockerRepoUrl}`,
            description: "IP For internal docker registry",
            $class: "org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl",
        },
    };
}

export function getJenkinsMavenCredential() {
    return {
        "": "0",
        "credentials": {
            scope: "GLOBAL",
            id: "maven-settings",
            file: "file",
            fileName: "settings.xml",
            description: "Maven settings.xml",
            $class: "org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl",
        },
    };
}
