import * as assert from "power-assert";

const MockAdapter = require("axios-mock-adapter");
import axios from "axios";
import {anyString, anything, instance, mock, when} from "ts-mockito";
import {QMConfig} from "../../../src/config/QMConfig";
import {DevOpsEnvironmentRequested} from "../../../src/gluon/team/DevOpsEnvironmentRequested";
import {OCCommandResult} from "../../../src/openshift/base/OCCommandResult";
import {OCClient} from "../../../src/openshift/OCClient";
import {OCCommon} from "../../../src/openshift/OCCommon";
import {OCPolicy} from "../../../src/openshift/OCPolicy";
import {TestMessageClient} from "../TestMessageClient";

import {logger} from "@atomist/automation-client";
import * as fs from "fs";
import * as path from "path";

const superagent = require("superagent");
const mockServer = require("mockttp").getLocal();

describe("DevOps environment test", () => {
    beforeEach(() => mockServer.start(8443));
    afterEach(() => mockServer.stop());

    it("should provision an environment", done => {
        const mockedAxios = new MockAdapter(axios);

        mockedAxios.onPost(`${QMConfig.subatomic.gluon.baseUrl}/members`).reply(200, {
            firstName: "Test",
            lastName: "User",
            email: "test.user@foo.co.za",
            domainUsername: "tete528",
            slack: {
                screenName: "test.user",
                userId: "9USDA7D6dH",
            },
        });

        const subject = new DevOpsEnvironmentRequested();
        const json = {
            DevOpsEnvironmentRequestedEvent: [
                {
                    team: {
                        name: "test-team",
                        slackIdentity: {
                            teamChannel: "test-channel",
                        },
                        owners: [
                            {
                                firstName: "Owner",
                                domainUsername: "domain/owner",
                                slackIdentity: {
                                    screenName: "owner.user",
                                },
                            },
                        ],
                        members: [
                            {
                                firstName: "Test",
                                domainUsername: "domain/test",
                                slackIdentity: {
                                    screenName: "test.user",
                                },
                            },
                        ],
                    },
                },
            ],
        };

        const fakeEventFired = {
            data: json,
            extensions: {
                operationName: "test",
            },
        };
        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        // Creating mock
        const mockedOCClient: OCClient = mock(OCClient);

        when(mockedOCClient.login(anyString(), anyString())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc login";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        when(mockedOCClient.newProject(anyString(), anyString(), anyString())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc new-project";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        // Getting instance from mock
        const stubbedOCClient: OCClient = instance(mockedOCClient);

        const mockedOCCommon: OCCommon = mock(OCCommon);

        when(mockedOCCommon.commonCommand(anyString(), anyString(), anything(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc other";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        when(mockedOCCommon.commonCommand("get", "templates", anything(), anything(), anything())).thenCall((command: string, arg2: string, parameters: string[]) => {
            return new Promise((resolve, reject) => {
                const response = new OCCommandResult();
                if (parameters.length === 0) {
                    response.command = "oc get";
                    response.output = "{\"items\":[]}";
                    response.status = true;
                } else {
                    const templateFile = path.resolve(__dirname, "./OCGetJenkinsTemplate.txt");
                    response.command = "oc get";
                    response.output = fs.readFileSync(templateFile, "utf8");
                    response.status = true;
                }
                return resolve(response);
            });
        });

        when(mockedOCCommon.commonCommand("get", "istag", anything(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc other";
            response.output = `{"items":[]}`;
            response.status = true;

            return resolve(response);
        }));

        when(mockedOCCommon.commonCommand("rollout status", "dc/jenkins", anything(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc get";
            response.output = "successfully rolled out";
            response.status = true;

            return resolve(response);
        }));

        when(mockedOCCommon.createFromFile(anyString(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc create-from-file";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        when(mockedOCCommon.createFromData(anything(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc create-from-data";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        const stubbedOCCommon: OCCommon = instance(mockedOCCommon);

        const mockedOCPolicy: OCPolicy = mock(OCPolicy);

        when(mockedOCPolicy.addRoleToUser(anyString(), anyString(), anyString(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc create-from-file";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        when(mockedOCPolicy.policyCommand(anyString(), anything(), anything())).thenReturn(new Promise((resolve, reject) => {
            const response = new OCCommandResult();
            response.command = "oc create-from-file";
            response.output = "success";
            response.status = true;

            return resolve(response);
        }));

        const stubbedOCPolicy: OCPolicy = instance(mockedOCPolicy);

        OCCommon.setInstance(stubbedOCCommon);
        OCClient.setInstance(stubbedOCClient);
        OCPolicy.setInstance(stubbedOCPolicy);

        subject.handle(fakeEventFired, fakeContext)
            .then(() => {
                logger.info(fakeContext.messageClient.textMsg);
                assert(fakeContext.messageClient.textMsg.text.trim() === "Your DevOps environment has been provisioned successfully");
                return Promise.resolve();
            })
            .then(done, done);
    }).timeout(10000);
});
