import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as glob from "glob";
import * as mime from "mime";
import * as fs from "fs"

export interface StaticWebsiteCacheRules {
    pattern: RegExp;
    ttl: number;
}

export type StaticWebsiteAPIRoute = awsx.apigateway.Route;

export interface StaticWebsiteArgs {

    /**
     * The absolute or relative path to folder containing the static website.
     */
    siteRoot: string;

    /**
     * Whether to provision a CloudFront CDN for the website.
     */
    cdn?: boolean;

    /**
     * Whether to capture logs.
     */
    logs?: boolean;

    /**
     * The domain name (e.g., "example.com"). Must be a Route53 hosted zone available in the account.
     */
    domain?: string;

    /**
     * The desired hostname (e.g., "www"). Combined with `domain` to form the final URL.
     */
    host?: string;

    /**
     * The home page document. Defaults to "index.html".
     */
    indexDocument?: string;

    /**
     * The default error document. Defaults to "404.html".
     */
    errorDocument?: string;

    /**
     * The number of seconds to keep items in the CloudFront cache. Defaults to 10 minutes.
     */
    cacheTtlInSeconds?: number;

    /**
     * An array of functions to expose as serverless handlers.
     */
    api?: {
        prefix: string;
        routes: StaticWebsiteAPIRoute[];
    }
}

export class StaticWebsite extends pulumi.ComponentResource {
    private bucket: aws.s3.Bucket;
    private logsBucket?: aws.s3.Bucket;
    private api?: awsx.apigateway.API;

    private args: StaticWebsiteArgs;

    private get domainName(): string | undefined {
        return this.args.host && this.args.domain
            ? [ this.args.host, this.args.domain ].join(".")
            : undefined;
    }

    bucketName: pulumi.Output<string>;
    bucketWebsiteURL: pulumi.Output<string>;
    cdnDomainName?: pulumi.Output<string>;
    cdnURL?: pulumi.Output<string>;
    websiteURL?: pulumi.Output<string>;
    websiteLogsBucketName?: pulumi.Output<string>;
    apiGatewayURL?: pulumi.Output<string>;

    /**
    * A Pulumi component resource that creates an S3 static website with an optional CloudFront CDN, domain name, and API Gateway .
    */
    constructor(name: string, args: StaticWebsiteArgs, opts?: pulumi.CustomResourceOptions) {
        super("pulumi-s3-static-website:index:StaticWebsite", name, args, opts);

        this.args = args;

        this.bucket = new aws.s3.Bucket(
            "website-bucket",
            {
                website: {
                    indexDocument: this.args.indexDocument || "index.html",
                    errorDocument: this.args.errorDocument || "404.html",
                },
                acl: aws.s3.PublicReadAcl,
                forceDestroy: true,
            },
            {
                parent: this,
            },
        );

        this.bucket.id.apply(async (bucket) => {
            const files = glob.sync(`${this.args.siteRoot}/**/*`, { nodir: true });

            if (pulumi.runtime.isDryRun()) {
                pulumi.log.info(`Skipped uploading ${files.length} files from ${this.args.siteRoot} (preview)...`)
                return;
            }

            try {
                pulumi.log.info(`Uploading ${files.length} files from ${this.args.siteRoot}...`);

                const result = await Promise.all(
                    files.map(file => {
                        const s3 = new aws.sdk.S3();

                        return s3.putObject({
                            Bucket: bucket,
                            Key: file.replace(`${this.args.siteRoot}/`, ""),
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

        this.bucketName = this.bucket.bucket;
        this.bucketWebsiteURL = this.bucket.websiteEndpoint.apply(e => pulumi.interpolate`http://${e}`);

        // When one or more API routes are passed in, provision an API Gateway with them.
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

            this.apiGatewayURL = this.api.url;
        }

        // When a host and domain are present OR `cdn` is true, provision a CloudFront distribution.
        if ((this.args.host && this.args.domain) || this.args.cdn) {
            const cdn = this.provisionCDN();
            const domainName = this.domainName;

            this.cdnDomainName = cdn.domainName;
            this.cdnURL = pulumi.interpolate`https://${cdn.domainName}`;
            this.websiteURL = pulumi.output(`https://${domainName}`);
        }

        this.registerOutputs({
            bucketName: this.bucketName,
            bucketWebsiteURL: this.bucketWebsiteURL,
            cdnDomainName: this.cdnDomainName,
            cdnURL: this.cdnURL,
            websiteURL: this.websiteURL,
            websiteLogsBucketName: this.websiteLogsBucketName,
            apiGatewayURL: this.apiGatewayURL,
        });
    }

    private provisionCDN(): aws.cloudfront.Distribution {
        const cacheTtl = 10 * 60;
        let cdn: aws.cloudfront.Distribution;

        const bucketOrigin: aws.types.input.cloudfront.DistributionOrigin = {
            originId: this.bucket.arn,
            domainName: this.bucket.websiteEndpoint,
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

            // Not specifying a default root object seems necessary, though I'm not entirely sure why.
            // (Using index.html, or just index, leads to a 404.)
            // defaultRootObject: undefined,

            defaultCacheBehavior: {
                targetOriginId: this.bucket.arn,
                viewerProtocolPolicy: "https-only",
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
                    responsePagePath: "/404.html",
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

        if (this.args.host && this.args.domain && this.domainName) {

            // Provision an validate a cert.
            const cert = this.provisionAndValidateCert();

            // Use the domain name for the CDN.
            distributionArgs.aliases = [
                this.domainName,
            ];

            // Use the cert.
            distributionArgs.viewerCertificate = {
                cloudfrontDefaultCertificate: false,
                acmCertificateArn: cert.arn,
                sslSupportMethod: "sni-only",
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

            cdn = this.makeCDN(distributionArgs);

            // Make a new Route53 record using the host and domain name.
            const zone = aws.route53.getZone({ name: this.args.domain });
            const record = new aws.route53.Record(
                this.domainName,
                {
                    name: this.args.host,
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
        } else {
            cdn = this.makeCDN(distributionArgs);
        }

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

        const zone = aws.route53.getZone({ name: this.args.domain });
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

        let opts: pulumi.CustomResourceOptions = {
            parent: this,
        };

        if (this.args.logs) {
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

            opts.dependsOn = [ this.logsBucket ];

            this.websiteLogsBucketName = this.logsBucket.bucket;
        }

        return new aws.cloudfront.Distribution(
            "website-cdn",
            distributionArgs,
            opts,
        );
    }
}
