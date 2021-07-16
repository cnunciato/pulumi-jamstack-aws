# pulumi-jamstack-aws

A Pulumi component for managing Jamstack websites on AWS.

### ☕️ Install Pulumi

If you haven't already, install Pulumi with our package manager of choice.

```
$ brew install pulumi
```

### 🗂 Start with a folder containing a static website

If you don't already have a folder containing a static website, create an empty folder, then put a static website into it. The following snippet creates a new React app, runs an initial build, and places the built website into the `build` folder.

```
$ npx create-react-app my-app
$ cd my-app
$ npm run build
$ cd ..
```

At this point, you'll have just the `my-app` folder containing your static-website source and build:

```
$ ls
my-app

$ ls my-app/build
asset-manifest.json
favicon.ico
index.html
logo192.png
logo512.png
manifest.json
robots.txt
static
```

### 🌥 Create a new Pulumi project and stack

Next, make a new folder alongside the `my-app` folder for the Pulumi project and stack, change to that folder, and run the new-project wizard, following the prompts:

```
$ mkdir my-app-infra && cd my-app-infra
$ pulumi new aws-typescript
```

Configure the new stack to deploy the contents of the `../my-app/build` folder:

```
$ pulumi config set siteRoot ../my-app/build
```

Optionally, if you have a domain registered with Route53, use that to apply a custom domain name and an SSL cert:

```
$ pulumi config set domain nunciato.org
$ pulumi config set host mysite
```

### ✨ Install this component

Still in the `my-app-infra` folder, install this component:

```
$ npm install --save @cnunciato/pulumi-jamstack-aws
```

### 🔨 Modify the program to deploy the website

Replace the contents of `my-app-infra/index.ts` with the following program, which deploys the `../my-app/build` folder as a static AWS S3 website and adds a single AWS Lambda callback function:

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

### 🧑🏻‍💻 Deploy

The program above deploys the built React app as an S3 static website with a CloudFront CDN and a single serverless function powered by AWS API Gateway.

```
$ pulumi up

Previewing update (dev)
...

Updating (dev)

View Live: https://app.pulumi.com/cnunciato/my-app-infra/dev/updates/51

     Type                                             Name                            Status      Info
 +   pulumi:pulumi:Stack                              my-app-infra-dev                created     2 messages
 +   └─ pulumi-s3-static-website:index:StaticWebsite  my-site                         created
 +      ├─ aws:apigateway:x:API                       website-api                     created
 +      │  ├─ aws:iam:Role                            website-api556be5ef             created
 +      │  ├─ aws:lambda:Function                     website-api556be5ef             created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-7cd09230    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-019020e7    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-1b4caae3    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-74d12784    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-6c156834    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-e1a3786d    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-b5aeb6b6    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-a1de8170    created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-api556be5ef-4aaabb8e    created
 +      │  ├─ aws:apigateway:RestApi                  website-api                     created
 +      │  ├─ aws:apigateway:Deployment               website-api                     created
 +      │  ├─ aws:lambda:Permission                   website-api-25e7c55b            created
 +      │  └─ aws:apigateway:Stage                    website-api                     created
 +      ├─ pulumi:providers:aws                       website-cert-provider           created
 +      ├─ aws:s3:Bucket                              website-logs-bucket             created
 +      ├─ aws:s3:Bucket                              website-bucket                  created
 +      ├─ aws:acm:Certificate                        website-cert                    created
 +      ├─ aws:route53:Record                         website-cert-validation-record  created
 +      ├─ aws:cloudfront:Distribution                website-cdn                     created
 +      ├─ aws:acm:CertificateValidation              website-cert-validation         created
 +      └─ aws:route53:Record                         mysite.nunciato.org             created

Diagnostics:
  pulumi:pulumi:Stack (my-app-infra-dev):
    Uploading 19 files from ../my-app/build...
    Uploaded 19 files.

Outputs:
    apiGatewayURL        : "https://mhwjazmf86.execute-api.us-west-2.amazonaws.com/api/"
    bucketName           : "website-bucket-3fa140b"
    bucketWebsiteURL     : "http://website-bucket-3fa140b.s3-website-us-west-2.amazonaws.com"
    cdnDomainName        : "d1lrmibvyanw0m.cloudfront.net"
    cdnURL               : "https://d1lrmibvyanw0m.cloudfront.net"
    websiteLogsBucketName: "website-logs-bucket-56c3ea2"
    websiteURL           : "https://mysite.nunciato.org"

Resources:
    + 26 created

Duration: 3m51s
```

### 🙌 Browse to the site and curl the API endpoint

```
$ open $(pulumi stack output websiteURL)
```

![image](https://user-images.githubusercontent.com/274700/126010822-b6a08f6e-587c-4880-bd6f-af8bee08a564.png)

![image](https://user-images.githubusercontent.com/274700/126010924-6aacf45d-6734-43ce-a2d8-4aa17ef7329a.png)
