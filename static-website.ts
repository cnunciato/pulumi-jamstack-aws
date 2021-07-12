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

export type StaticWebsiteServerlessFunction = awsx.apigateway.Route;

export interface StaticWebsiteArgs {

    /**
     * The absolute or relative path to folder containing the static website.
     */
    siteRoot: string;

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
    api?: StaticWebsiteServerlessFunction[];
}

export class StaticWebsite extends pulumi.ComponentResource {
    private bucket: aws.s3.Bucket;
    private cdn?: aws.cloudfront.Distribution;
    private api?: awsx.apigateway.API;

    private domainName: string;

    get bucketEndpoint(): pulumi.Output<string> {
        return this.bucket.websiteEndpoint.apply(e => pulumi.interpolate`http://${e}`);
    }

    get apiEndpoint(): pulumi.Output<string> | undefined {
        if (this.api) {
            return this.api.url;
        }
    }

    get cdnEndpoint(): pulumi.Output<string> | undefined {
        if (this.cdn) {
            return pulumi.interpolate`https://${this.cdn.domainName}`;
        }
    }

    get url(): pulumi.Output<string> | undefined {
        if (this.cdn) {
            return pulumi.interpolate`https://${this.domainName}`;
        }
        return this.bucketEndpoint;
    }

    /**
    * A Pulumi component resource that creates an S3 static website with an optional HTTPS URL.
    */
    constructor(name: string, args: StaticWebsiteArgs, opts?: pulumi.CustomResourceOptions) {
        super("pulumi-s3-static-website:index:StaticWebsite", name, args, opts);

        this.domainName = [ args.host, args.domain ].join(".");

        this.bucket = new aws.s3.Bucket(
            "website-bucket",
            {
                website: {
                    indexDocument: args.indexDocument || "index.html",
                    errorDocument: args.errorDocument || "404.html",
                },
                acl: aws.s3.PublicReadAcl,
                forceDestroy: true,
            },
            {
                parent: this,
            },
        );

        if (args.api && args.api.length > 0) {
            this.api = new awsx.apigateway.API(
                "website-api",
                {
                    routes: args.api,
                },
                {
                    parent: this,
                },
            );
        }

        if (args.host && args.domain) {
            const tenMinutesInSeconds = 60 * 10;
            const cacheTtl = args.cacheTtlInSeconds || tenMinutesInSeconds;

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

            (async () => {
                const zone = await aws.route53.getZone({ name: args.domain });
                const validationOption = cert.domainValidationOptions[0];

                const certificateValidationDomain = new aws.route53.Record(
                    "website-cert-validation-record",
                    {
                        zoneId: zone.zoneId,
                        name: validationOption.resourceRecordName,
                        type: validationOption.resourceRecordType,
                        records: [
                            validationOption.resourceRecordValue,
                        ],
                        ttl: cacheTtl,
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
            })();

            // Define the properties of the CloudFront distribution.
            const distributionArgs: aws.cloudfront.DistributionArgs = {
                enabled: true,
                aliases: [
                    this.domainName,
                ],
                origins: [
                    {
                        originId: this.bucket.arn,
                        domainName: this.bucket.websiteEndpoint,
                        customOriginConfig: {
                            originProtocolPolicy: "http-only",
                            httpPort: 80,
                            httpsPort: 443,
                            originSslProtocols: ["TLSv1.2"],
                        },
                    }
                ],

                // Not specifying a default root object seems necessary, though I'm not entirely sure why.
                // (Using index.html, or just index, leads to a 404.)
                defaultRootObject: undefined,

                defaultCacheBehavior: {
                    targetOriginId: this.bucket.arn,
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
                        responsePagePath: "/404",
                    },
                ],
                restrictions: {
                    geoRestriction: {
                        restrictionType: "none",
                    },
                },
                viewerCertificate: {
                    acmCertificateArn: cert.arn,
                    sslSupportMethod: "sni-only",
                },
            };

            this.cdn = new aws.cloudfront.Distribution(
                "website-cdn",
                distributionArgs,
                {
                    parent: this,
                },
            );

            (async (targetDomain: string, distribution: aws.cloudfront.Distribution): Promise<aws.route53.Record> => {
                const zone = await aws.route53.getZone({ name: args.domain });

                return new aws.route53.Record(
                    targetDomain,
                    {
                        name: args.host || "should-not-be-necessary",
                        zoneId: zone.zoneId,
                        type: "A",
                        aliases: [
                            {
                                name: distribution.domainName,
                                zoneId: distribution.hostedZoneId,
                                evaluateTargetHealth: true,
                            },
                        ],
                    },
                    {
                        parent: this,
                    },
                );
            })(this.domainName, this.cdn);
        }

        this.bucket.id.apply(async (bucket) => {
            const files = glob.sync(`${args.siteRoot}/**/*`, { nodir: true });

            if (pulumi.runtime.isDryRun()) {
                pulumi.log.info(`Skipped uploading ${files.length} files from ${args.siteRoot} (preview)...`)
                return;
            }

            try {
                pulumi.log.info(`Uploading ${files.length} files from ${args.siteRoot}...`);

                const result = await Promise.all(
                    files.map(file => {
                        const s3 = new aws.sdk.S3();

                        return s3.putObject({
                            Bucket: bucket,
                            Key: file.replace(`${args.siteRoot}/`, ""),
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
    }
}
