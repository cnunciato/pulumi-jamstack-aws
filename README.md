# pulumi-jamstack-aws

A Pulumi component for managing Jamstack websites on AWS.

```
npm install --save @cnunciato/pulumi-jamstack-aws
```

```
import { StaticWebsite } from "@cnunciato/pulumi-jamstack-aws";

const site = new StaticWebsite("my-site", {
    siteRoot: "../public",
    api: [
        {
            method: "GET",
            path: "/hello",
            eventHandler: async () => {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ hi: "nice to see you." })
                };
            },
        },
    ],
});

export const { bucketEndpoint, apiEndpoint, cdnEndpoint, url } = site;
```
