import * as pulumi from "@pulumi/pulumi";

import { StaticWebsite } from "@cnunciato/pulumi-jamstack-aws";

const config = new pulumi.Config();
const siteRoot = config.require("siteRoot");
const domain = config.get("domain");
const host = config.get("host");

const site = new StaticWebsite("my-site", {
    siteRoot,
    domain,
    host,
    logs: true,
    api: {
        prefix: "api",
        routes: [
            {
                method: "GET",
                path: "/hello",
                eventHandler: async () => {
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: "Hello, world!!",
                        }),
                    };
                },
            },
        ],
    },
});

export const {
    bucketName,
    bucketWebsiteURL,
    websiteURL,
    websiteLogsBucketName,
    apiGatewayURL,
    cdnDomainName,
    cdnURL,
} = site;
