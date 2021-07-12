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

### ✨ Install this component

Still in the `my-app-infra` folder, install this component:

```
$ npm install --save @cnunciato/pulumi-jamstack-aws
```

### 🔨 Modify the program to deploy the website

Replace the contents of `my-app-infra/index.ts` with the following program, which deploys the `../my-app/build` folder as a static AWS S3 website and adds a single AWS Lambda callback function:

```
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
```

### 🧑🏻‍💻 Deploy

The program above deploys the built React app as an S3 static website and a single AWS Lambda function using AWS API Gateway.

```
$ pulumi up
Previewing update (dev)
...
Updating (dev)

View Live: https://app.pulumi.com/cnunciato/my-app-infra/dev/updates/1

     Type                                             Name                          Status      Info
 +   pulumi:pulumi:Stack                              my-app-infra-dev              created     2 messages
 +   └─ pulumi-s3-static-website:index:StaticWebsite  my-site                       created
 +      ├─ aws:apigateway:x:API                       website-api                   created
 +      │  ├─ aws:iam:Role                            website-apifc45ff03           created
 +      │  ├─ aws:lambda:Function                     website-apifc45ff03           created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-1b4caae3  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-019020e7  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-6c156834  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-4aaabb8e  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-b5aeb6b6  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-e1a3786d  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-a1de8170  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-74d12784  created
 +      │  ├─ aws:iam:RolePolicyAttachment            website-apifc45ff03-7cd09230  created
 +      │  ├─ aws:apigateway:RestApi                  website-api                   created
 +      │  ├─ aws:apigateway:Deployment               website-api                   created
 +      │  ├─ aws:lambda:Permission                   website-api-62a1b306          created
 +      │  └─ aws:apigateway:Stage                    website-api                   created
 +      └─ aws:s3:Bucket                              website-bucket                created

Diagnostics:
  pulumi:pulumi:Stack (my-app-infra-dev):
    Uploading 19 files from ../my-app/build...
    Uploaded 19 files.

Outputs:
    apiEndpoint: "https://0rvd7ip4i0.execute-api.us-west-2.amazonaws.com/stage/"
    url        : "http://website-bucket-747d634.s3-website-us-west-2.amazonaws.com"

Resources:
    + 19 created

Duration: 39s
```

### 🙌 Browse to the site and curl the API endpoint

```
$ open $(pulumi stack output url)
```

![image](https://user-images.githubusercontent.com/274700/125365415-0f9c5500-e329-11eb-8c90-2f25fba6ee3a.png)

```
$ curl $(pulumi stack output apiEndpoint)/hello
{"message":"Greetings from AWS Lambda!"}
```

## Inputs

* `siteRoot` (required): The absolute or relative path to folder containing the static website.
* `domain` (optional): The domain name (e.g., "example.com"). Must be a Route53 hosted zone available in the account.
* `host`  (optional): The desired hostname (e.g., "www"). Combined with `domain` to form the final URL
* `cacheTtl`  (optional): The number of seconds to keep items in the CloudFront cache. Defaults to 10 minutes.
* `indexDocument` (optional): The home page document. Defaults to "index.html".
* `errorDocument` (optional): The default error document. Defaults to "404.html".
* `api` (optional): An array of functions to expose as serverless handlers.

## Outputs

* `bucketEndpoint`: The fully-qualified S3 website bucket URL.
* `apiEndpoint`: The fully-qualified API Gateway URL and path prefix.
* `cdnEndpoint`: The CloudFront domain name (e.g., https://something.cloudfront.net).
* `url`: The publicly accessible URL of the website.
