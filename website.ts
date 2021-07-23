import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as glob from "glob";
import * as mime from "mime";
import * as path from "path";
import * as fs from "fs"

export type WebsiteAPIRoute = awsx.apigateway.Route;

export interface WebsiteArgs {
    protocol?: "http" | "https";

    site?: {
        root: string;
        defaultDoc?: string;
        errorDoc?: string;
    }

    dns?: {
        domain: string;
        host: string;
    };

    cdn?: {
        certificateARN?: string;
        cacheTTL?: number;
        logs?: boolean;
    }

    api?: {
        prefix: string;
        routes: WebsiteAPIRoute[];
    }
}

interface WebsiteOutputs {
    bucketName?: pulumi.Output<string>;
    bucketWebsiteURL?: pulumi.Output<string>;
    cdnDomainName?: pulumi.Output<string>;
    cdnURL?: pulumi.Output<string>;
    websiteURL?: pulumi.Output<string>;
    websiteLogsBucketName?: pulumi.Output<string>;
    apiGatewayURL?: pulumi.Output<string>;
}

export class Website extends pulumi.ComponentResource {
    private bucket?: aws.s3.Bucket;
    private logsBucket?: aws.s3.Bucket;
    private api?: awsx.apigateway.API;
    private args: WebsiteArgs;
    private outputs: WebsiteOutputs;

    bucketName?: pulumi.Output<string>;
    bucketWebsiteURL?: pulumi.Output<string>;
    websiteURL?: pulumi.Output<string>;
    websiteLogsBucketName?: pulumi.Output<string>;
    apiGatewayURL?: pulumi.Output<string>;
    cdnDomainName?: pulumi.Output<string>;
    cdnURL?: pulumi.Output<string>;

    /**
    * A Pulumi component resource that creates an S3 static website with an optional CloudFront CDN, domain name, and API Gateway .
    */
    constructor(name: string, args: WebsiteArgs, opts?: pulumi.CustomResourceOptions) {
        super("pulumi-s3-static-website:index:Website", name, args, opts);

        this.args = args;
        this.outputs = {};

        // Apply defaults.
        if (!args.protocol) {
            args.protocol = "http";
        }

        // If a site was defined, make a bucket for it.
        if (args.site) {

            if (!args.site.defaultDoc) {
                args.site.defaultDoc = "index.html";
            }

            if (!args.site.errorDoc) {
                args.site.errorDoc = "404.html";
            }

            // Check that the directory exists.
            if (!fs.existsSync(args.site.root)) {
                pulumi.log.warn(`Directory ${args.site.root} does not exist.`);
            }

            // Check that the default document exists.
            if (!fs.existsSync(path.join(args.site.root, args.site.defaultDoc))) {
                pulumi.log.warn(`Default document "${args.site.defaultDoc}" does not exist.`);
            }

            // Check that the error document exists.
            if (!fs.existsSync(path.join(args.site.root, args.site.errorDoc))) {
                pulumi.log.warn(`Default document "${args.site.errorDoc}" does not exist.`);
            }

            let explicitBucketName: string | undefined;

            if (args.protocol === "http" && args.dns?.domain && args.dns.host) {
                explicitBucketName = this.domainName;
            }

            // Make the bucket website.
            this.bucket = new aws.s3.Bucket(
                "website-bucket",
                {
                    bucket: explicitBucketName,
                    website: {
                        indexDocument: args.site.defaultDoc,
                        errorDocument: args.site.errorDoc,
                    },
                    acl: aws.s3.PublicReadAcl,
                    forceDestroy: true,
                },
                {
                    parent: this,
                },
            );

            // Upload the files of the website to the bucket.
            this.bucket.id.apply(async bucket => {
                const root = args.site?.root;

                if (!root) {
                    return;
                }

                const files = glob.sync(`${root}/**/*`, { nodir: true });

                if (pulumi.runtime.isDryRun()) {
                    pulumi.log.info(`Skipping upload of ${files.length} files from ${root}...`)
                    return;
                }

                try {
                    pulumi.log.info(`Uploading ${files.length} files from ${root}...`);

                    const result = await Promise.all(
                        files.map(file => {
                            const s3 = new aws.sdk.S3();

                            return s3.putObject({
                                Bucket: bucket,
                                Key: file.replace(`${root}/`, ""),
                                Body: fs.readFileSync(file),
                                ContentType: mime.getType(file) || "text/plain",
                                ACL: aws.s3.PublicReadAcl,
                            }).promise();
                        }),
                    );

                    pulumi.log.info(`Uploaded ${result.length} files.`);
                } catch (err) {
                    pulumi.log.error(err);
                }
            });

            // Make a Route 53 record (CNAME) for the website.
            if (this.bucket && explicitBucketName && args.dns?.domain && args.dns.host) {
                const domain = args.dns.domain
                const host = args.dns.host;
                const bucketName = explicitBucketName;
                const bucketEndpoint = this.bucket.websiteEndpoint;

                aws.route53.getZone({ name: args.dns.domain })
                    .then(zone => {
                        const record = new aws.route53.Record(
                            bucketName,
                            {
                                name: host,
                                zoneId: zone.zoneId,
                                type: "CNAME",
                                ttl: 10 * 60,
                                records: [
                                    bucketEndpoint,
                                ],
                            },
                            {
                                parent: this,
                            },
                        );
                    })
                    .catch(err => {
                        pulumi.log.info(`Domain ${domain} not found in Route 53. Not creating DNS record.`);
                    });

                this.outputs.websiteURL = pulumi.interpolate`http://${this.domainName}`;
            }

            // Set output properties.
            this.outputs.bucketName = this.bucket.bucket;
            this.outputs.bucketWebsiteURL = this.bucket.websiteEndpoint.apply(e => pulumi.interpolate`http://${e}`);
        }

        // If one or more API routes are passed in, provision an API Gateway with them.
        if (this.args.api && this.args.api.prefix && this.args.api.routes && this.args.api.routes.length > 0) {
            this.api = new awsx.apigateway.API(
                "website-api",
                {
                    stageName: this.args.api.prefix,
                    routes: this.args.api.routes.map(route => {
                        route.path = `/${this.args.api?.prefix}${route.path}`;
                        return route;
                    }),
                },
                {
                    parent: this,
                },
            );

            this.outputs.apiGatewayURL = this.api.url;
        }

        if (this.bucket && this.args.protocol === "https") {
            const cdn = this.provisionCDN(this.bucket);
            this.outputs.cdnDomainName = cdn.domainName;
            this.outputs.cdnURL = pulumi.interpolate`https://${cdn.domainName}`;
            this.outputs.websiteURL = pulumi.interpolate`https://${this.domainName}`;
        }

        this.setOutputs();
    }

    private provisionCDN(bucket: aws.s3.Bucket): aws.cloudfront.Distribution {
        const cacheTtl = 10 * 60;
        let cdn: aws.cloudfront.Distribution;

        const bucketOrigin: aws.types.input.cloudfront.DistributionOrigin = {
            originId: bucket.arn,
            domainName: bucket.websiteEndpoint,
            customOriginConfig: {
                originProtocolPolicy: "http-only",
                httpPort: 80,
                httpsPort: 443,
                originSslProtocols: ["TLSv1.2"],
            },
        }

        // Define the properties of the CloudFront distribution.
        const distributionArgs: aws.cloudfront.DistributionArgs = {
            enabled: true,

            origins: [
                bucketOrigin,
            ],

            defaultCacheBehavior: {
                targetOriginId: bucket.arn,
                viewerProtocolPolicy: "redirect-to-https",
                allowedMethods: ["GET", "HEAD", "OPTIONS"],
                cachedMethods: ["GET", "HEAD", "OPTIONS"],
                defaultTtl: cacheTtl,
                maxTtl: cacheTtl,
                minTtl: 0,
                forwardedValues: {
                    queryString: true,
                    cookies: {
                        forward: "all"
                    },
                },
            },
            priceClass: "PriceClass_100",
            customErrorResponses: [
                {
                    errorCode: 404,
                    responseCode: 404,
                    responsePagePath: `/$${this.args.site?.errorDoc || "404.html"}`,
                },
            ],
            restrictions: {
                geoRestriction: {
                    restrictionType: "none",
                },
            },
            viewerCertificate: {
                cloudfrontDefaultCertificate: true,
                sslSupportMethod: "sni-only",
            },
        };

        if (this.api && this.args.api && this.args.api.prefix) {
            const apiGatewayOrigin: aws.types.input.cloudfront.DistributionOrigin = {
                originId: this.api.restAPI.arn,
                originPath: `/${this.args.api.prefix}`,
                domainName: this.api.url.apply(url => url.replace(`/${this.args.api?.prefix}/`, "").replace("https://", "")),
                customOriginConfig: {
                    originProtocolPolicy: "https-only",
                    httpPort: 80,
                    httpsPort: 443,
                    originSslProtocols: ["TLSv1.2"],
                },
            };

            distributionArgs.origins = [
                apiGatewayOrigin,
                bucketOrigin,
            ];

            distributionArgs.orderedCacheBehaviors = [
                {
                    pathPattern: `/${this.args.api.prefix}/*`,
                    targetOriginId: this.api.restAPI.arn,
                    viewerProtocolPolicy: "https-only",
                    allowedMethods: ["GET", "HEAD", "OPTIONS"],
                    cachedMethods: ["GET", "HEAD", "OPTIONS"],
                    defaultTtl: 0,
                    maxTtl: 0,
                    minTtl: 0,
                    forwardedValues: {
                        queryString: true,
                        headers: [
                            "Access-Control-Request-Headers",
                            "Access-Control-Request-Method",
                            "Origin",
                            "Authorization",
                        ],
                        cookies: {
                            forward: "none",
                        },
                    },
                },
            ];
        }

        // If no DNS info was provided, make a CloudFront CDN with the default settings.
        if (!this.args.dns || !this.domainName) {
            cdn = this.makeCDN(distributionArgs);
            return cdn;
        }

        let certARN: pulumi.Output<string>;

        // If a cert ARN was passed in, use that; otherwise provision and validate a new one.
        if (this.args.cdn && this.args.cdn.certificateARN) {
            certARN = pulumi.output(this.args.cdn.certificateARN);
        } else {
            certARN = this.provisionAndValidateCert().arn;
        }

        distributionArgs.aliases = [
            this.domainName,
        ];

        distributionArgs.viewerCertificate = {
            cloudfrontDefaultCertificate: false,
            acmCertificateArn: certARN,
            sslSupportMethod: "sni-only",
        };

        cdn = this.makeCDN(distributionArgs);

        // Make a Route 53 record with the host and domain name.
        const zone = aws.route53.getZone({ name: this.args.dns.domain });
        const record = new aws.route53.Record(
            this.domainName,
            {
                name: this.args.dns.host,
                zoneId: zone.then(zone => zone.zoneId),
                type: "A",
                aliases: [
                    {
                        name: cdn.domainName,
                        zoneId: cdn.hostedZoneId,
                        evaluateTargetHealth: true,
                    },
                ],
            },
            {
                parent: this,
            },
        );

        return cdn;
    }

    private provisionAndValidateCert(): aws.acm.Certificate {

        // Certs need to be provisioned in us-east-1.
        const usEast1 = new aws.Provider(
            "website-cert-provider",
            {
                region: "us-east-1"
            },
            {
                parent: this,
            },
        );

        const cert = new aws.acm.Certificate(
            "website-cert",
            {
                domainName: this.domainName,
                validationMethod: "DNS",
            },
            {
                parent: this,
                provider: usEast1,
            },
        );

        const zone = aws.route53.getZone({ name: this.args.dns?.domain });
        const validationOption = cert.domainValidationOptions[0];

        const certificateValidationDomain = new aws.route53.Record(
            "website-cert-validation-record",
            {
                zoneId: zone.then(zone => zone.zoneId),
                name: validationOption.resourceRecordName,
                type: validationOption.resourceRecordType,
                records: [
                    validationOption.resourceRecordValue,
                ],
                ttl: 10 * 60, // Ten minutes, in seconds.
            },
            {
                parent: this,
            },
        );

        const certificateValidation = new aws.acm.CertificateValidation(
            "website-cert-validation",
            {
                certificateArn: cert.arn,
                validationRecordFqdns: [
                    certificateValidationDomain.fqdn
                ],
            },
            {
                provider: usEast1,
                parent: this,
            },
        );

        return cert;
    }

    private makeCDN(distributionArgs: aws.cloudfront.DistributionArgs): aws.cloudfront.Distribution {

        let distributionOpts: pulumi.CustomResourceOptions = {
            parent: this,
        };

        if (this.args.cdn?.logs) {
            this.logsBucket = new aws.s3.Bucket(
                "website-logs-bucket",
                {
                    forceDestroy: true,
                },
                {
                    parent: this,
                },
            );

            distributionArgs.loggingConfig = {
                bucket: this.logsBucket.bucketDomainName,
                includeCookies: false,
            };

            distributionOpts.dependsOn = [ this.logsBucket ];

            this.outputs.websiteLogsBucketName = this.logsBucket.bucket;
        }

        return new aws.cloudfront.Distribution(
            "website-cdn",
            distributionArgs,
            distributionOpts,
        );
    }

    private get domainName() {
        if (this.args.dns && this.args.dns.domain && this.args.dns.host) {
            return [this.args.dns.host, this.args.dns.domain].join(".");
        }
        return undefined;
    }

    private setOutputs() {
        this.bucketName = this.outputs.bucketName;
        this.bucketWebsiteURL = this.outputs.bucketWebsiteURL;
        this.websiteURL = this.outputs.websiteURL;
        this.websiteLogsBucketName = this.outputs.websiteLogsBucketName;
        this.apiGatewayURL = this.outputs.apiGatewayURL;
        this.cdnDomainName = this.outputs.cdnDomainName;
        this.cdnURL = this.outputs.cdnURL;

        this.registerOutputs({
            bucketName: this.outputs.bucketName,
            bucketWebsiteURL: this.outputs.bucketWebsiteURL,
            cdnDomainName: this.outputs.cdnDomainName,
            cdnURL: this.outputs.cdnURL,
            websiteURL: this.outputs.websiteURL,
            websiteLogsBucketName: this.outputs.websiteLogsBucketName,
            apiGatewayURL: this.outputs.apiGatewayURL,
        });
    }
}
