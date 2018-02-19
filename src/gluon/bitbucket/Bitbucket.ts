import axios from "axios";
import {AxiosInstance} from "axios-https-proxy-fix";
import * as config from "config";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import {QMConfig} from "../../config/QMConfig";

export function bitbucketAxios(): AxiosInstance {
    const caFile = path.resolve(__dirname, QMConfig.subatomic.bitbucket.ca);
    return axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: true,
            ca: fs.readFileSync(caFile),
        }),
        auth: QMConfig.subatomic.bitbucket.auth,
    });
}

export function bitbucketUserFromUsername(username: string): Promise<any> {
    return bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.baseUrl}/api/1.0/admin/users?filter=${username}`)
        .then(user => {
            return user.data;
        });
}

export function bitbucketProjectFromKey(bitbucketProjectKey: string): Promise<any> {
    return bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.baseUrl}/api/1.0/projects/${bitbucketProjectKey}`)
        .then(project => {
            return project.data;
        });
}
