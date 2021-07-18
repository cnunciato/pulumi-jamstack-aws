# pulumi-jamstack-aws

A [Pulumi](https://pulumi.io/) component for managing JAMstack websites on AWS. ([What's a JAMstack](https://jamstack.wtf/)?)

### Install Pulumi

If you haven't already, install Pulumi with your package manager of choice.

```
$ brew install pulumi
```

### 1. Start with a folder containing a static website

If you don't already have a folder containing a static website, create an empty folder, then put a static website into it. The following snippet creates a new React app, runs an initial build, and places the built website into the `build` folder.

```
$ npx create-react-app site
$ cd site
$ npm run build
$ cd ..
```

At this point, you'll have just the `site` folder containing your static-website source and build:

```
$ ls
site

$ ls site/build
... index.html ...
```

### 2. Create a Pulumi project and stack

Make a new folder alongside the `my-app` folder for the Pulumi project and stack, change to that folder, and run the new-project wizard, following the prompts:

```
$ mkdir infra && cd infra
$ pulumi new aws-typescript
```

Configure the new stack to deploy the contents of the `../site/build` folder:

```
$ pulumi config set siteRoot ../site/build
```

Optionally, if you have a domain registered with Route53, use that to apply a custom domain name and an SSL cert:

```
$ pulumi config set domain nunciato.org
$ pulumi config set host site-dev
```

### 3. Install this component from npm ✨

Still in the `infra` folder, [install this component](https://www.npmjs.com/package/@cnunciato/pulumi-jamstack-aws):

```
$ npm install --save @cnunciato/pulumi-jamstack-aws
```

### 4. Modify the program to use the component

Replace the contents of `infra/index.ts` with the following program (for example), which deploys the `../site/build` folder as a static website on Amazon S3 website, distributes it globally with a CloudFront CDN, uses a custom domain name (via Route 53) with SSL/TLS, and adds a single serverless API endpoint using AWS Lambda:

```typescript
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
```

### 5. Deploy!

Launch the website.

```
$ pulumi up

Previewing update (dev)
...

Updating (dev)

View Live: https://app.pulumi.com/cnunciato/pulumi-jamstack-aws-test-npm-infra/dev/updates/1

     Type                                             Name                                    Status      Info
 +   pulumi:pulumi:Stack                              pulumi-jamstack-aws-test-npm-infra-dev  created     2 messages
 +   └─ pulumi-s3-static-website:index:StaticWebsite  my-site                                 created
 +      ├─ aws:apigateway:x:API                       website-api                             created
 +      │  ├─ aws:iam:Role                            website-api556be5ef                     created
 +      │  ├─ aws:lambda:Function                     website-api556be5ef                     created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-6c156834            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-a1de8170            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-7cd09230            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-4aaabb8e            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-74d12784            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-1b4caae3            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-019020e7            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-b5aeb6b6            created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-e1a3786d            created
 +      │  ├─ aws:apigateway:RestApi                  website-api                             created
 +      │  ├─ aws:apigateway:Deployment               website-api                             created
 +      │  ├─ aws:lambda:Permission                   website-api-25e7c55b                    created
 +      │  └─ aws:apigateway:Stage                    website-api                             created
 +      ├─ pulumi:providers:aws                       website-cert-provider                   created
 +      ├─ aws:s3:Bucket                              website-logs-bucket                     created
 +      ├─ aws:s3:Bucket                              website-bucket                          created
 +      ├─ aws:acm:Certificate                        website-cert                            created
 +      ├─ aws:route53:Record                         website-cert-validation-record          created
 +      ├─ aws:cloudfront:Distribution                website-cdn                             created
 +      ├─ aws:acm:CertificateValidation              website-cert-validation                 created
 +      └─ aws:route53:Record                         site-dev.nunciato.org                   created

Diagnostics:
  pulumi:pulumi:Stack (pulumi-jamstack-aws-test-npm-infra-dev):
    Uploading 19 files from ../site/build...
    Uploaded 19 files.

Outputs:
    apiGatewayURL        : "https://ahb7yks8ne.execute-api.us-west-2.amazonaws.com/api/"
    bucketName           : "website-bucket-ba59ae4"
    bucketWebsiteURL     : "http://website-bucket-ba59ae4.s3-website-us-west-2.amazonaws.com"
    cdnDomainName        : "d3u94s721ztogo.cloudfront.net"
    cdnURL               : "https://d3u94s721ztogo.cloudfront.net"
    websiteLogsBucketName: "website-logs-bucket-f9c977a"
    websiteURL           : "https://site-dev.nunciato.org"

Resources:
    + 26 created

Duration: 3m55s
```

### 6. Browse to the website and query the API endpoint

```
$ open $(pulumi stack output websiteURL)
```

![image](https://user-images.githubusercontent.com/274700/126080824-4cf49b45-4c93-4897-9c0f-e881acf3d4c0.png)

```
$ curl -v $(pulumi stack output websiteURL)/api/hello
{"message":"Hello, world!!"}
```

### 7. (Optional) Tear it all down

```
$ pulumi destroy -y

...
Destroying (dev)

...

Resources:
    - 26 deleted

Duration: 4m12s
```
