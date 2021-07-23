import { Website } from "@cnunciato/pulumi-jamstack-aws";

const site = new Website("my-site", {
    protocol: "https",

    site: {
        path: "../site/build",
    },

    domain: {
        name: "nunciato.org",
        host: "site-dev",
    },

    cdn: {
        cacheTTL: 10 * 60,
        logs: true,
    },

    api: {
        prefix: "api",
        routes: [
            {
                method: "GET",
                path: "/hello/{name}",
                eventHandler: async (event: any) => {
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: `Hello, ${event.pathParameters?.name}!`,
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
    cdnDomainName,
    cdnURL,
    apiGatewayURL,
    websiteURL,
    websiteLogsBucketName,
} = site;
