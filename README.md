# pulumi-jamstack-aws

A [Pulumi](https://pulumi.io/) component for managing JAMstack websites on AWS. ([What's a JAMstack](https://jamstack.wtf/)?)

## Why do I need this component?

Because while making static website may be easy, deploying them &mdash; into the cloud, on your own &mdash; is hard. This component aims to make that whole process a little less painful.

## What does it do?

Given a folder containing a static website, an optional domain name, and an optional set of URL routes and accompanying functions, the component deploys the website on Amazon S3, gives it a domain name with Route 53, distributes it globally with CloudFront (including SSL/TLS), and deploys the functions as a set of serverless endpoints with AWS API Gateway.

## Using the component

### Step 0: Install Pulumi

If you haven't already, install Pulumi with your package manager of choice.

```
$ brew install pulumi
```

### Step 1. Make a static website

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

### Step 2. Create a Pulumi project and stack

Make a new folder alongside the `site` folder for the Pulumi project and stack, change to that folder, and run the new-project wizard, following the prompts:

```
$ mkdir infra && cd infra
$ pulumi new aws-typescript
```
### Step 3. Install this component from npm ✨

Still in the `infra` folder, [install this component](https://www.npmjs.com/package/@cnunciato/pulumi-jamstack-aws):

```
$ npm install --save @cnunciato/pulumi-jamstack-aws
```

### Step 4. Declare a website

Replace the contents of `infra/index.ts` with the following program (for example), which deploys the `../site/build` folder as a static website on Amazon S3, distributes it globally with a CloudFront CDN, uses a custom domain name (via Route 53) with SSL/TLS, and adds a single serverless API endpoint using AWS Lambda:

```typescript
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
```

### Step 5. Deploy!

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

### Step 6. Browse to the website and query the API endpoint

```
$ open $(pulumi stack output websiteURL)
```

![image](https://user-images.githubusercontent.com/274700/126080824-4cf49b45-4c93-4897-9c0f-e881acf3d4c0.png)

```
$ curl -v $(pulumi stack output websiteURL)/api/hello
{"message":"Hello, world!!"}
```

### Step 7. (Optional) Tear it all down

```
$ pulumi destroy -y

...
Destroying (dev)

...

Resources:
    - 26 deleted

Duration: 4m12s
```
