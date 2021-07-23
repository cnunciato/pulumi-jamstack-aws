import { Website } from "@cnunciato/pulumi-jamstack-aws";

const site = new Website("my-site", {
    protocol: "http",

    dns: {
        domain: "nunciato.org",
        host: "test-site",
    },

    site: {
        root: "../site/build",
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
