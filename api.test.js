const fs = require('fs')
const AWS = require('aws-sdk')

const { validateConfig, pushNewCodeBundles, deployLambdas, publishLambdas, activateLambdas } = require('./index')

jest.mock('fs')
jest.mock('aws-sdk')

describe('update lambda edge API', () => {
  let s3ConstructorMock
  let lambdaConstructorMock
  let s3UploadMock
  let s3GetObjectMock
  let lambdaListVersionsByFunctionMock
  let lambdaUpdateFunctionCodeMock
  let lambdaPublishVersionMock
  let cloudFrontGetDistributionConfigMock
  let cloudFrontUpdateDistributionMock
  let fakeConfig

  beforeEach(() => {
    // silence console output
    jest.spyOn(console, 'log').mockImplementation(() => {})

    s3ConstructorMock = jest.fn()
    lambdaConstructorMock = jest.fn()
    s3UploadMock = jest.fn()
    s3GetObjectMock = jest.fn()
    lambdaListVersionsByFunctionMock = jest.fn()
    lambdaUpdateFunctionCodeMock = jest.fn()
    lambdaPublishVersionMock = jest.fn()
    cloudFrontGetDistributionConfigMock = jest.fn()
    cloudFrontUpdateDistributionMock = jest.fn()

    AWS.S3 = class S3 {
      constructor({ apiVersion, region }) {
        this.apiVersion = apiVersion
        this.region = region

        s3ConstructorMock({ apiVersion, region })
      }

      upload(...args) {
        return {
          promise: () => s3UploadMock(...args),
        }
      }

      getObject(...args) {
        return {
          promise: () => s3GetObjectMock(...args),
        }
      }
    }

    AWS.Lambda = class Lambda {
      constructor({ apiVersion, region }) {
        this.apiVersion = apiVersion
        this.region = region

        lambdaConstructorMock({ apiVersion, region })
      }

      listVersionsByFunction(...args) {
        return {
          promise: () => lambdaListVersionsByFunctionMock(...args),
        }
      }

      updateFunctionCode(...args) {
        return {
          promise: () => lambdaUpdateFunctionCodeMock(...args),
        }
      }

      publishVersion(...args) {
        return {
          promise: () => lambdaPublishVersionMock(...args),
        }
      }
    }

    AWS.CloudFront = class CloudFront {
      constructor({ apiVersion, region }) {
        this.apiVersion = apiVersion
        this.region = region
      }

      getDistributionConfig(...args) {
        return {
          promise: () => cloudFrontGetDistributionConfigMock(...args),
        }
      }

      updateDistribution(...args) {
        return {
          promise: () => cloudFrontUpdateDistributionMock(...args),
        }
      }
    }

    fakeConfig = {
      awsRegion: undefined,
      cfDistributionID: 'cloudfront',
      cacheBehaviorPath: 'default',
      autoIncrementVersion: true,
      lambdaCodeS3Bucket: 'bucket',
      cfTriggers: [
        {
          cfTriggerName: 'viewer-request',
          lambdaFunctionName: 'viewer-request-fake',
          lambdaCodeS3Key: 'root/fake/path/to/vreq-lambda.zip',
          lambdaCodeFilePath: '/absolute/path/to/vreq-lambda-local.zip',
        },
        {
          cfTriggerName: 'origin-request',
          lambdaFunctionName: 'origin-request-fake',
          lambdaCodeS3Key: 'root/fake/path/to/oreq-lambda.zip',
          lambdaCodeFilePath: 'relative/path/to/oreq-lambda-local.zip',
        },
        {
          cfTriggerName: 'origin-response',
          lambdaFunctionName: 'origin-response-fake',
          lambdaCodeS3Key: 'root/fake/path/to/ores-lambda.zip',
          lambdaCodeFilePath: '/dist/ores-lambda-local.zip',
        },
        {
          cfTriggerName: 'viewer-response',
          lambdaFunctionName: 'viewer-response-fake',
          lambdaCodeS3Key: 'root/fake/path/to/vres-lambda.zip',
          lambdaCodeFilePath: '/dist/vres-lambda-local.zip',
        },
      ],
    }
  })

  describe('validateConfig()', () => {
    it('should ensure that all required fields are present', () => {
      const validConfig = validateConfig(fakeConfig, ['cfDistributionID', 'lambdaCodeS3Bucket'], ['cfTriggerName'])
      const invalidConfig = validateConfig(fakeConfig, ['awsRegion', 'lambdaCodeS3Bucket'], ['cfTriggerName'])
      const invalidTrigger = validateConfig(
        fakeConfig,
        ['lambdaCodeS3Bucket'],
        ['cfTriggerName', 'lambdaFunctionVersion'],
      )

      expect(validConfig).toBe(true)
      expect(invalidConfig).toBe(false)
      expect(invalidTrigger).toBe(false)
    })

    it('should ensure that all config fields are known', () => {
      fakeConfig.notARealField = 'hello'

      expect(validateConfig(fakeConfig)).toBe(false)
    })

    it('should ensure that all trigger fields are known', () => {
      fakeConfig.cfTriggers[0].notARealField = 'hello'

      expect(validateConfig(fakeConfig)).toBe(false)
    })

    it('should ensure at least one trigger', () => {
      fakeConfig.cfTriggers = []

      expect(validateConfig(fakeConfig)).toBe(false)
    })
  })

  describe('pushNewCodeBundles()', () => {
    beforeEach(() => {
      // just return the path for debugging
      fs.createReadStream.mockImplementation((path) => path)

      // return the latest version as "1"
      lambdaListVersionsByFunctionMock.mockImplementation(() => ({
        Versions: [
          {
            Version: '1',
          },
        ],
      }))
    })

    it('should validate the config', async () => {
      fakeConfig.lambdaCodeS3Bucket = undefined

      return expect(pushNewCodeBundles(fakeConfig)).rejects.toThrow('Invalid config.')
    })

    it('should use the awsRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'

      await pushNewCodeBundles(fakeConfig)

      expect(s3ConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2006-03-01',
        region: 'fake-region',
      })

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-region',
      })
    })

    it('should use s3Region and lambdaRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'
      fakeConfig.s3Region = 'fake-s3-region'
      fakeConfig.lambdaRegion = 'fake-lambda-region'

      await pushNewCodeBundles(fakeConfig)

      expect(s3ConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2006-03-01',
        region: 'fake-s3-region',
      })

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-lambda-region',
      })
    })

    it('should auto-increment the version', async () => {
      await pushNewCodeBundles(fakeConfig)

      expect(s3UploadMock).toHaveBeenCalledTimes(4)
      expect(s3UploadMock).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'root/fake/path/to/vres-lambda-2.zip',
        Body: '/dist/vres-lambda-local.zip',
      })
    })

    it('should use version 1 if auto-increment is true and there are no published versions', async () => {
      lambdaListVersionsByFunctionMock.mockImplementation(() => ({
        Versions: [],
      }))

      await pushNewCodeBundles(fakeConfig)

      expect(s3UploadMock).toHaveBeenCalledTimes(4)
      expect(s3UploadMock).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'root/fake/path/to/vres-lambda-1.zip',
        Body: '/dist/vres-lambda-local.zip',
      })
    })

    it('should use the provided version', async () => {
      fakeConfig.autoIncrementVersion = false
      fakeConfig.cfTriggers.forEach((t) => (t.lambdaFunctionVersion = '5'))

      await pushNewCodeBundles(fakeConfig)

      expect(s3UploadMock).toHaveBeenCalledTimes(4)
      expect(s3UploadMock).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'root/fake/path/to/vres-lambda-5.zip',
        Body: '/dist/vres-lambda-local.zip',
      })
    })

    it('should use no version', async () => {
      fakeConfig.autoIncrementVersion = false

      await pushNewCodeBundles(fakeConfig)

      expect(s3UploadMock).toHaveBeenCalledTimes(4)
      expect(s3UploadMock).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'root/fake/path/to/vres-lambda.zip',
        Body: '/dist/vres-lambda-local.zip',
      })
    })

    it("should not upload when it's a dry run", async () => {
      fakeConfig.dryRun = true

      await pushNewCodeBundles(fakeConfig)

      expect(s3UploadMock).toHaveBeenCalledTimes(0)
    })
  })

  describe('deployLambdas()', () => {
    beforeEach(() => {
      // return the latest version as "1"
      lambdaListVersionsByFunctionMock.mockImplementation(() => ({
        Versions: [
          {
            Version: '1',
          },
        ],
      }))
    })

    it('should validate the config', async () => {
      fakeConfig.lambdaCodeS3Bucket = undefined

      return expect(deployLambdas(fakeConfig)).rejects.toThrow('Invalid config.')
    })

    it('should use the awsRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'

      await deployLambdas(fakeConfig)

      expect(s3ConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2006-03-01',
        region: 'fake-region',
      })

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-region',
      })
    })

    it('should use s3Region and lambdaRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'
      fakeConfig.s3Region = 'fake-s3-region'
      fakeConfig.lambdaRegion = 'fake-lambda-region'

      s3GetObjectMock.mockResolvedValue({
        Body: 'zip file buffer',
      })

      await deployLambdas(fakeConfig)

      expect(s3ConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2006-03-01',
        region: 'fake-s3-region',
      })

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-lambda-region',
      })
    })

    it('should auto-increment the version', async () => {
      await deployLambdas(fakeConfig)

      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledTimes(4)
      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledWith({
        FunctionName: 'viewer-response-fake',
        S3Bucket: 'bucket',
        S3Key: 'root/fake/path/to/vres-lambda-2.zip',
      })
    })

    it('should use the provided version', async () => {
      fakeConfig.autoIncrementVersion = false
      fakeConfig.cfTriggers.forEach((t) => (t.lambdaFunctionVersion = '5'))

      await deployLambdas(fakeConfig)

      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledTimes(4)
      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledWith({
        FunctionName: 'viewer-response-fake',
        S3Bucket: 'bucket',
        S3Key: 'root/fake/path/to/vres-lambda-5.zip',
      })
    })

    it('should use no version', async () => {
      fakeConfig.autoIncrementVersion = false

      await deployLambdas(fakeConfig)

      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledTimes(4)
      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledWith({
        FunctionName: 'viewer-response-fake',
        S3Bucket: 'bucket',
        S3Key: 'root/fake/path/to/vres-lambda.zip',
      })
    })

    it('should download from S3 when s3Region and lambdaRegion are set', async () => {
      fakeConfig.s3Region = 'fake-s3-region'
      fakeConfig.lambdaRegion = 'fake-lambda-region'

      s3GetObjectMock.mockResolvedValue({
        Body: 'zip file buffer',
      })

      await deployLambdas(fakeConfig)

      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledTimes(4)
      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledWith({
        FunctionName: 'viewer-response-fake',
        ZipFile: 'zip file buffer',
      })
    })

    it("should not deploy when it's a dry run", async () => {
      fakeConfig.dryRun = true

      await deployLambdas(fakeConfig)

      expect(lambdaUpdateFunctionCodeMock).toHaveBeenCalledTimes(0)
    })
  })

  describe('publishLambdas()', () => {
    it('should validate the config', async () => {
      fakeConfig.cfTriggers[0].lambdaFunctionName = undefined

      return expect(publishLambdas(fakeConfig)).rejects.toThrow('Invalid config.')
    })

    it('should use the awsRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'

      await publishLambdas(fakeConfig)

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-region',
      })
    })

    it('should use the lambdaRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'
      fakeConfig.lambdaRegion = 'fake-lambda-region'

      await publishLambdas(fakeConfig)

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-lambda-region',
      })
    })

    it('should publish a new version of the lambdas', async () => {
      await publishLambdas(fakeConfig)

      expect(lambdaPublishVersionMock).toHaveBeenCalledTimes(4)
      expect(lambdaPublishVersionMock).toHaveBeenCalledWith({
        FunctionName: 'viewer-response-fake',
      })
    })

    it("should not publish a new version of the lambdas if it's a dry run", async () => {
      fakeConfig.dryRun = true
      await publishLambdas(fakeConfig)

      expect(lambdaPublishVersionMock).toHaveBeenCalledTimes(0)
    })
  })

  describe('activateLambdas()', () => {
    let cloudFrontDistributionConfig
    beforeEach(() => {
      cloudFrontDistributionConfig = {
        ETag: 'etag',
        DistributionConfig: {
          DefaultCacheBehavior: {
            LambdaFunctionAssociations: {
              Items: [
                {
                  EventType: 'viewer-request',
                  LambdaFunctionARN: 'old-arn',
                },
                {
                  EventType: 'origin-request',
                  LambdaFunctionARN: 'old-arn',
                },
                {
                  EventType: 'origin-response',
                  LambdaFunctionARN: 'old-arn',
                },
                {
                  EventType: 'viewer-response',
                  LambdaFunctionARN: 'old-arn',
                },
              ],
            },
          },
          CacheBehaviors: {
            Items: [
              {
                PathPattern: '/*',
                LambdaFunctionAssociations: {
                  Items: [
                    {
                      EventType: 'viewer-request',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'origin-request',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'origin-response',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'viewer-response',
                      LambdaFunctionARN: 'old-arn',
                    },
                  ],
                },
              },
            ],
          },
        },
      }

      cloudFrontGetDistributionConfigMock.mockResolvedValue(cloudFrontDistributionConfig)

      lambdaListVersionsByFunctionMock.mockImplementation(() => ({
        Versions: [
          {
            Version: '1',
            FunctionArn: 'arn-v1',
          },
          {
            Version: '2',
            FunctionArn: 'arn-v2',
          },
          {
            Version: '3',
            FunctionArn: 'arn-v3',
          },
        ],
      }))
    })

    it('should validate the config', async () => {
      fakeConfig.cfDistributionID = undefined

      return expect(activateLambdas(fakeConfig)).rejects.toThrow('Invalid config.')
    })

    it('should use the awsRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'

      await activateLambdas(fakeConfig)

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-region',
      })
    })

    it('should use the lambdaRegion', async () => {
      fakeConfig.awsRegion = 'fake-region'
      fakeConfig.lambdaRegion = 'fake-lambda-region'

      await activateLambdas(fakeConfig)

      expect(lambdaConstructorMock).toHaveBeenCalledWith({
        apiVersion: '2015-03-31',
        region: 'fake-lambda-region',
      })
    })

    it('should update the default cache behavior with the latest ARNs', async () => {
      await activateLambdas(fakeConfig)

      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledTimes(1)
      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledWith({
        Id: 'cloudfront',
        IfMatch: 'etag',
        DistributionConfig: {
          DefaultCacheBehavior: {
            LambdaFunctionAssociations: {
              Items: [
                {
                  EventType: 'viewer-request',
                  LambdaFunctionARN: 'arn-v3',
                },
                {
                  EventType: 'origin-request',
                  LambdaFunctionARN: 'arn-v3',
                },
                {
                  EventType: 'origin-response',
                  LambdaFunctionARN: 'arn-v3',
                },
                {
                  EventType: 'viewer-response',
                  LambdaFunctionARN: 'arn-v3',
                },
              ],
            },
          },
          CacheBehaviors: {
            Items: [
              {
                PathPattern: '/*',
                LambdaFunctionAssociations: {
                  Items: [
                    {
                      EventType: 'viewer-request',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'origin-request',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'origin-response',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'viewer-response',
                      LambdaFunctionARN: 'old-arn',
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    })

    it('should update the specified cache behavior with the latest ARNs', async () => {
      fakeConfig.cacheBehaviorPath = '/*'
      await activateLambdas(fakeConfig)

      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledTimes(1)
      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledWith({
        Id: 'cloudfront',
        IfMatch: 'etag',
        DistributionConfig: {
          DefaultCacheBehavior: {
            LambdaFunctionAssociations: {
              Items: [
                {
                  EventType: 'viewer-request',
                  LambdaFunctionARN: 'old-arn',
                },
                {
                  EventType: 'origin-request',
                  LambdaFunctionARN: 'old-arn',
                },
                {
                  EventType: 'origin-response',
                  LambdaFunctionARN: 'old-arn',
                },
                {
                  EventType: 'viewer-response',
                  LambdaFunctionARN: 'old-arn',
                },
              ],
            },
          },
          CacheBehaviors: {
            Items: [
              {
                PathPattern: '/*',
                LambdaFunctionAssociations: {
                  Items: [
                    {
                      EventType: 'viewer-request',
                      LambdaFunctionARN: 'arn-v3',
                    },
                    {
                      EventType: 'origin-request',
                      LambdaFunctionARN: 'arn-v3',
                    },
                    {
                      EventType: 'origin-response',
                      LambdaFunctionARN: 'arn-v3',
                    },
                    {
                      EventType: 'viewer-response',
                      LambdaFunctionARN: 'arn-v3',
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    })

    it('should update the default cache behavior with specific version ARNs', async () => {
      fakeConfig.cfTriggers[0].lambdaFunctionVersion = '1'
      fakeConfig.cfTriggers[1].lambdaFunctionVersion = '2'
      fakeConfig.cfTriggers[2].lambdaFunctionVersion = '3'
      fakeConfig.cfTriggers[3].lambdaFunctionVersion = undefined // will get latest
      fakeConfig.autoIncrementVersion = false
      await activateLambdas(fakeConfig)

      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledTimes(1)
      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledWith({
        Id: 'cloudfront',
        IfMatch: 'etag',
        DistributionConfig: {
          DefaultCacheBehavior: {
            LambdaFunctionAssociations: {
              Items: [
                {
                  EventType: 'viewer-request',
                  LambdaFunctionARN: 'arn-v1',
                },
                {
                  EventType: 'origin-request',
                  LambdaFunctionARN: 'arn-v2',
                },
                {
                  EventType: 'origin-response',
                  LambdaFunctionARN: 'arn-v3',
                },
                {
                  EventType: 'viewer-response',
                  LambdaFunctionARN: 'arn-v3',
                },
              ],
            },
          },
          CacheBehaviors: {
            Items: [
              {
                PathPattern: '/*',
                LambdaFunctionAssociations: {
                  Items: [
                    {
                      EventType: 'viewer-request',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'origin-request',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'origin-response',
                      LambdaFunctionARN: 'old-arn',
                    },
                    {
                      EventType: 'viewer-response',
                      LambdaFunctionARN: 'old-arn',
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    })

    it('should not update anything if invalid cache behavior path is supplied', async () => {
      fakeConfig.cacheBehaviorPath = '/invalid/path/pattern/*'
      await activateLambdas(fakeConfig)

      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledTimes(1)
      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledWith({
        Id: 'cloudfront',
        IfMatch: 'etag',
        DistributionConfig: cloudFrontDistributionConfig.DistributionConfig,
      })
    })

    it("should not update the distribution config if it's a dry run", async () => {
      fakeConfig.dryRun = true
      await activateLambdas(fakeConfig)

      expect(cloudFrontUpdateDistributionMock).toHaveBeenCalledTimes(0)
    })
  })
})
