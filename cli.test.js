const tempWrite = require('temp-write')
const AWS = require('aws-sdk')

const api = require('./index')
const cli = require('./bin/update-lambda-edge')

jest.mock('aws-sdk')
jest.mock('./index')

describe('update-lambda-edge CLI', () => {
  describe('create config', () => {
    it('should set the dry run flag on', () => {
      cli.parse('push --dry-run')

      expect(api.pushNewCodeBundles).toHaveBeenCalledWith(expect.objectContaining({
        dryRun: true
      }))
    })

    it('should leave the dry run flag off', () => {
      cli.parse('push')

      expect(api.pushNewCodeBundles).toHaveBeenCalledWith(expect.objectContaining({
        dryRun: false
      }))
    })

    it('should set the auto-increment flag on (default state)', () => {
      cli.parse('push --auto-increment')

      expect(api.pushNewCodeBundles).toHaveBeenCalledWith(expect.objectContaining({
        autoIncrementVersion: true
      }))
    })

    it('should set the auto-increment flag off when version is set explicitly', () => {
      cli.parse('push --auto-increment --lambda-version 5')

      expect(api.pushNewCodeBundles).toHaveBeenCalledWith(expect.objectContaining({
        autoIncrementVersion: false
      }))
    })

    describe('with config file', () => {
      let configFilePath

      beforeEach(() => {
        configFilePath = tempWrite.sync(JSON.stringify({
            awsRegion: 'fake',
            cfDistributionID: 'fake',
            autoIncrementVersion: true,
            lambdaCodeS3Bucket: 'fake',
            cfTriggers: [
              {
                cfTriggerName: 'viewer-request',
                lambdaFunctionName: 'viewer-request-fake',
                lambdaCodeS3Key: 'root/fake/path/to/vreq-lambda.zip',
                lambdaCodeFilePath: '/absolute/path/to/vreq-lambda-local.zip'
              },
              {
                cfTriggerName: 'origin-request',
                lambdaFunctionName: 'origin-request-fake',
                lambdaCodeS3Key: 'root/fake/path/to/oreq-lambda.zip',
                lambdaCodeFilePath: 'relative/path/to/oreq-lambda-local.zip'
              },
              {
                cfTriggerName: 'origin-response',
                lambdaFunctionName: 'origin-response-fake',
                lambdaCodeS3Key: 'root/fake/path/to/ores-lambda.zip',
                lambdaCodeFilePath: '/dist/ores-lambda-local.zip'
              },
              {
                cfTriggerName: 'viewer-response',
                lambdaFunctionName: 'viewer-response-fake',
                lambdaCodeS3Key: 'root/fake/path/to/vres-lambda.zip',
                lambdaCodeFilePath: '/dist/vres-lambda-local.zip'
              }
            ]
          }, null, 2), 'config.json')
      })

      it('should load the data from the config file and properly parse paths', () => {
        cli.parse(`push --config ${configFilePath}`)

        expect(api.pushNewCodeBundles).toHaveBeenCalledWith({
            dryRun: false,
            awsRegion: 'fake',
            cfDistributionID: 'fake',
            autoIncrementVersion: true,
            lambdaCodeS3Bucket: 'fake',
            cfTriggers: [
              {
                cfTriggerName: 'viewer-request',
                lambdaFunctionName: 'viewer-request-fake',
                lambdaCodeS3Key: 'root/fake/path/to/vreq-lambda.zip',
                lambdaCodeFilePath: '/absolute/path/to/vreq-lambda-local.zip',
                lambdaFunctionVersion: undefined,
              },
              {
                cfTriggerName: 'origin-request',
                lambdaFunctionName: 'origin-request-fake',
                lambdaCodeS3Key: 'root/fake/path/to/oreq-lambda.zip',
                lambdaCodeFilePath: __dirname + '/relative/path/to/oreq-lambda-local.zip',
                lambdaFunctionVersion: undefined,
              },
              {
                cfTriggerName: 'origin-response',
                lambdaFunctionName: 'origin-response-fake',
                lambdaCodeS3Key: 'root/fake/path/to/ores-lambda.zip',
                lambdaCodeFilePath: '/dist/ores-lambda-local.zip',
                lambdaFunctionVersion: undefined,
              },
              {
                cfTriggerName: 'viewer-response',
                lambdaFunctionName: 'viewer-response-fake',
                lambdaCodeS3Key: 'root/fake/path/to/vres-lambda.zip',
                lambdaCodeFilePath: '/dist/vres-lambda-local.zip',
                lambdaFunctionVersion: undefined,
              }
            ]
          }
        )
      })

      it('should properly parse paths when pwd is set', () => {
        cli.parse(`push --config ${configFilePath} --pwd /some/random/folder`)

        expect(api.pushNewCodeBundles).toHaveBeenCalledWith(expect.objectContaining({
            cfTriggers: [
              expect.objectContaining({
                lambdaCodeFilePath: '/absolute/path/to/vreq-lambda-local.zip',
              }),
              expect.objectContaining({
                lambdaCodeFilePath: '/some/random/folder/relative/path/to/oreq-lambda-local.zip',
              }),
              expect.any(Object),
              expect.any(Object)
            ]
          })
        )
      })

      it('should override config options from the command line', () => {
        cli.parse(`push --config ${configFilePath} --region somewhere --distribution-id MYCLOUDFRONT --bucket S3 --lambda-version 5`)

        expect(api.pushNewCodeBundles).toHaveBeenCalledWith({
            dryRun: false,
            awsRegion: 'somewhere',
            cfDistributionID: 'MYCLOUDFRONT',
            autoIncrementVersion: false,
            lambdaCodeS3Bucket: 'S3',
            cfTriggers: [
              expect.objectContaining({
                lambdaFunctionVersion: '5'
              }),
              expect.objectContaining({
                lambdaFunctionVersion: '5'
              }),
              expect.objectContaining({
                lambdaFunctionVersion: '5'
              }),
              expect.objectContaining({
                lambdaFunctionVersion: '5'
              })
            ]
          }
        )
      })

      it('should only update the specified triggers', () => {
        cli.parse(`push --config ${configFilePath} --vreq --ores --vres`)

        expect(api.pushNewCodeBundles).toHaveBeenCalledWith(expect.objectContaining({
            cfTriggers: [
              expect.objectContaining({
                cfTriggerName: 'viewer-request',
              }),
              expect.objectContaining({
                cfTriggerName: 'origin-response',
              }),
              expect.objectContaining({
                cfTriggerName: 'viewer-response',
              }),
            ]
          })
        )
      })
    })
  })

  describe('push', () => {
    it('should push a single Lambda bundle', () => {
      cli.parse('push --bucket test-bucket --key test-key --function-name test-function --file-path test/file/path.zip')

      expect(api.pushNewCodeBundles).toHaveBeenCalledWith({
        dryRun: false,
        cfDistributionID: undefined,
        autoIncrementVersion: true,
        lambdaCodeS3Bucket: 'test-bucket',
        awsRegion: undefined,
        cfTriggers: [
          {
            cfTriggerName: undefined,
            lambdaFunctionName: 'test-function',
            lambdaFunctionVersion: undefined,
            lambdaCodeS3Key: 'test-key',
            lambdaCodeFilePath: 'test/file/path.zip'
          }
        ]
      })
    })
  })

  describe('deploy', () => {
    it('should deploy a single Lambda bundle', () => {
      cli.parse('deploy --bucket test-bucket --key test-key --function-name test-function')

      expect(api.deployLambdas).toHaveBeenCalledWith({
        dryRun: false,
        cfDistributionID: undefined,
        autoIncrementVersion: true,
        lambdaCodeS3Bucket: 'test-bucket',
        awsRegion: undefined,
        cfTriggers: [
          {
            cfTriggerName: undefined,
            lambdaFunctionName: 'test-function',
            lambdaFunctionVersion: undefined,
            lambdaCodeS3Key: 'test-key',
            lambdaCodeFilePath: undefined
          }
        ]
      })
    })
  })

  describe('publish', () => {
    it('should publish a single Lambda bundle', () => {
      cli.parse('publish --function-name test-function')

      expect(api.publishLambdas).toHaveBeenCalledWith({
        dryRun: false,
        cfDistributionID: undefined,
        autoIncrementVersion: false,
        lambdaCodeS3Bucket: undefined,
        awsRegion: undefined,
        cfTriggers: [
          {
            cfTriggerName: undefined,
            lambdaFunctionName: 'test-function',
            lambdaFunctionVersion: undefined,
            lambdaCodeS3Key: undefined,
            lambdaCodeFilePath: undefined
          }
        ]
      })
    })
  })

  describe('activate', () => {
    it('should activate a single Lambda bundle', () => {
      cli.parse('activate --distribution-id cloudfront --trigger-name viewer-request --function-name test-function --lambda-version 5')

      expect(api.activateLambdas).toHaveBeenCalledWith({
        dryRun: false,
        cfDistributionID: 'cloudfront',
        autoIncrementVersion: false,
        lambdaCodeS3Bucket: undefined,
        awsRegion: undefined,
        cfTriggers: [
          {
            cfTriggerName: 'viewer-request',
            lambdaFunctionName: 'test-function',
            lambdaFunctionVersion: '5',
            lambdaCodeS3Key: undefined,
            lambdaCodeFilePath: undefined
          }
        ]
      })
    })
  })
})