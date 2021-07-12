import * as pulumi from "@pulumi/pulumi";

import { StaticWebsite } from "@cnunciato/pulumi-jamstack-aws";

const config = new pulumi.Config();
const siteRoot = config.require("siteRoot");

const site = new StaticWebsite("my-site", {
    siteRoot,
    api: [
        {
            method: "GET",
            path: "/hello",
            eventHandler: async () => {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: "Greetings from AWS Lambda!"
                    }),
                };
            },
        },
    ],
});

export const { apiEndpoint, url } = site;
