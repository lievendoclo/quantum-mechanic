import axios from "axios";
import {AxiosPromise} from "axios-https-proxy-fix";
import * as https from "https";
import * as _ from "lodash";

export function kickOffFirstBuild(jenkinsHost: string,
                                  token: string,
                                  gluonProjectName: string,
                                  gluonApplicationName: string): AxiosPromise {
    const jenkinsAxios = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    return jenkinsAxios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/build?delay=0sec`,
        "", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
}

export function kickOffBuild(jenkinsHost: string,
                             token: string,
                             gluonProjectName: string,
                             gluonApplicationName: string): AxiosPromise {
    const jenkinsAxios = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    return jenkinsAxios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/job/master/build?delay=0sec`,
        "", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
}
