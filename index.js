const fs = require('fs')
const path = require('path')
const AWS = require('aws-sdk')

/**
 * Validates a configuration object
 * @param {CommandConfig} config A command configuration object
 * @param {string[]} requiredFields List of required config fields (excluding cfTriggers)
 * @param {string[]} requiredTriggerFields List of required config fields for each trigger
 * @returns {boolean}
 */
const validateConfig = (config, requiredFields = [], requiredTriggerFields = []) => {
  const validFields = ['dryRun', 'awsRegion', 'cfDistributionID', 'cacheBehaviorPath', 'autoIncrementVersion', 'lambdaCodeS3Bucket', 'lambdaCodeS3Bucket', 'cfTriggers']
  const validTriggerFields = ['cfTriggerName', 'lambdaFunctionName', 'lambdaFunctionVersion', 'lambdaCodeS3Key', 'lambdaCodeFilePath']

  // ensure all fields in the config are expected
  for (let field of Object.keys(config)) {
    if (!validFields.includes(field)) {
      console.log(`[VALIDATION ERROR]: unknown field '${field}' found in config.`, config)
      return false
    }
  }

  // ensure all required fields are defined
  for (let field of requiredFields) {
    if (typeof config[field] === 'undefined') {
      console.log(`[VALIDATION ERROR]: '${field}' is required for each trigger.`, config)
      return false
    }
  }

  // ensure that there is at least one trigger
  if (!config.cfTriggers?.length) {
    console.log(`[VALIDATION ERROR]: at least one trigger configuration is required.`, config)
    return false
  }

  // validate each trigger configuration
  for (let trigger of config.cfTriggers) {
    // ensure all fields in the trigger confg are expected
    for (let field of Object.keys(trigger)) {
      if (!validTriggerFields.includes(field)) {
        console.log(`[VALIDATION ERROR]: unknown field '${field}' found in trigger config.`, trigger)
        return false
      }
    }

    // ensure all required fields are defined
    for (let field of requiredTriggerFields) {
      if (typeof trigger[field] === 'undefined') {
        console.log(`[VALIDATION ERROR]: '${field}' is required for each trigger.`, trigger)
        return false
      }
    }
  }

  return true
}

/**
 * Iterates through all the versions of a Lambda function to find the most recent sequential version
 *
 * @param {Lambda.FunctionName} functionName The fully qualified Lambda function name
 * @param {AWS.Region} region The AWS region the Lambda is in
 * @param {string} version The sequential version number to get (gets the latest if blank)
 * @returns {Promise<Lambda.Version>}
 */
const getLambdaVersion = async (functionName, region, version= '') => {
  const lambda = new AWS.Lambda({
    apiVersion: '2015-03-31',
    region
  })
  const versions = []
  let nextMarker

  do {
    const versionData = await lambda.listVersionsByFunction({
      FunctionName: functionName,
      Marker: nextMarker,
    }).promise()

    nextMarker = versionData.NextMarker
    versions.push(...versionData.Versions)
  } while (nextMarker)

  // if no versions have been published, return an empty version
  if (!versions.length) {
    return {
      Version: '0'
    }
  }

  if (version) {
    return versions.find(v => v.Version === version)
  }

  return versions.filter(version => version.Version !== '$LATEST').sort((a, b) => Number(b.Version) - Number(a.Version))[0]
}

/**
 * Fetches the full configuration for a CloudFront distribution
 *
 * @param {CloudFront.DistributionId} distributionID The CloudFront distribution ID
 * @param {AWS.Region} region The AWS region
 * @returns {Promise<CloudFront.DistributionConfig>}
 */
const getCloudFrontDistributionConfig = async (distributionID, region) => {
  const cloudfront = new AWS.CloudFront({
    apiVersion: '2020-05-31',
    region
  })

  return cloudfront.getDistributionConfig({
    Id: distributionID
  }).promise()
}

/**
 * Modifies a CloudFront configuration with a new Lambda ARN for a specific trigger
 *
 * @param {CloudFront.DistributionConfig} distributionConfig The current CloudFront distribution config
 * @param {string} cacheBehaviorPath The PathPattern of the CacheBehavior to update, or "default" to use DefaultCacheBehavior
 * @param {Lambda.Arn} lambdaARN The ARN for the new Lambda to use as a trigger
 * @param {CloudFront.EventType} triggerName The name of the trigger event ['viewer-request'|'origin-request'|'origin-response'|'viewer-response']
 * @returns {*}
 */
const changeCloudFrontDistributionLambdaARN = (distributionConfig, cacheBehaviorPath, lambdaARN, triggerName) => {

  try {
    const cacheBehavior = cacheBehaviorPath === 'default' ?
      distributionConfig.DistributionConfig.DefaultCacheBehavior :
      distributionConfig.DistributionConfig.CacheBehaviors.Items.find(item => item.PathPattern === cacheBehaviorPath)

    if (!cacheBehavior) {
      console.log('No cache behavior found for PathPattern', cacheBehaviorPath)
      return distributionConfig
    }

    const lambdaFunction = cacheBehavior.LambdaFunctionAssociations.Items.find(item => item.EventType === triggerName)

    if (lambdaFunction.LambdaFunctionARN !== lambdaARN) {
      lambdaFunction.LambdaFunctionARN = lambdaARN
    }
  } catch (e) {}

  return distributionConfig
}

/**
 * Updates a CloudFront distribution with the provided config
 *
 * @param {CloudFront.DistributionId} distributionID The CloudFront distribution ID
 * @param {CloudFront.DistributionConfig} distributionConfig The current CloudFront distribution config
 * @param {AWS.Region} region
 * @returns {Promise<CloudFront.UpdateDistributionResult, AWSError>}
 */
const updateCloudFrontDistribution = async (distributionID, distributionConfig, region) => {
  const cloudfront = new AWS.CloudFront({
    apiVersion: '2020-05-31',
    region
  })

  return cloudfront.updateDistribution({
    Id: distributionID,
    IfMatch: distributionConfig.ETag,
    DistributionConfig: distributionConfig.DistributionConfig
  }).promise()
}

/**
 * Pushes a ZIP file containing Lambda code to S3
 *
 * @param config The project configuration to update
 *
 * @return {Promise<void>}
 */
const pushNewCodeBundles = async (config) => {
  if (!validateConfig(config, ['lambdaCodeS3Bucket'], ['lambdaFunctionName', 'lambdaCodeS3Key', 'lambdaCodeFilePath'])) {
    throw new Error('Invalid config.')
  }

  const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    region: config.awsRegion
  })

  for (let trigger of config.cfTriggers) {
    let version = trigger.lambdaFunctionVersion
    if (trigger.lambdaFunctionName && config.autoIncrementVersion) {
      version = `${Number((await getLambdaVersion(trigger.lambdaFunctionName, config.awsRegion)).Version) + 1}`
    }

    let key = trigger.lambdaCodeS3Key
    if (version) {
      key = key.replace(/\.zip$/, `-${version}.zip`)
    }

    const s3Config = {
      Bucket: config.lambdaCodeS3Bucket,
      Key: key,
      Body: fs.createReadStream(trigger.lambdaCodeFilePath)
    }

    console.log('Pushing to S3 with the following config:', {
      ...s3Config,
      Body: `File: ${trigger.lambdaCodeFilePath}`
    })

    if (config.dryRun) {
      console.log('[DRY RUN]: Not pushing code bundles to S3')
      continue
    }

    await s3.upload(s3Config).promise()

    console.log('Successfully pushed to S3.')
  }
}

/**
 * Updates a Lambda function's code with a ZIP file in S3
 *
 * @param config The project configuration to update
 *
 * @return {Promise<void>}
 */
const deployLambdas = async (config) => {
  if (!validateConfig(config, ['lambdaCodeS3Bucket'], ['lambdaFunctionName', 'lambdaCodeS3Key'])) {
    throw new Error('Invalid config.')
  }

  const lambda = new AWS.Lambda({
    apiVersion: '2015-03-31',
    region: config.awsRegion
  })

  for (let trigger of config.cfTriggers) {
    let version = trigger.lambdaFunctionVersion
    if (config.autoIncrementVersion) {
      version = `${Number((await getLambdaVersion(trigger.lambdaFunctionName, config.awsRegion)).Version) + 1}`
    }

    let key = trigger.lambdaCodeS3Key
    if (version) {
      key = key.replace(/\.zip$/, `-${version}.zip`)
    }

    const lambdaConfig = {
      FunctionName: trigger.lambdaFunctionName,
      S3Bucket: config.lambdaCodeS3Bucket,
      S3Key: key
    }

    console.log('Updating Lambda code with the following config', lambdaConfig)
    if (config.dryRun) {
      console.log('[DRY RUN]: Not updating Lambda function code')
      continue
    }

    await lambda.updateFunctionCode(lambdaConfig).promise()

    console.log('Successfully deployed new code.')
  }
}

/**
 * Publishes a new version of a Lambda function
 *
 * @param config The project configuration to update
 *
 * @return {Promise<void>}
 */
const publishLambdas = async (config) => {
  if (!validateConfig(config, [], ['lambdaFunctionName'])) {
    throw new Error('Invalid config.')
  }

  const lambda = new AWS.Lambda({
    apiVersion: '2015-03-31',
    region: config.awsRegion
  })

  for (let trigger of config.cfTriggers) {
    const lambdaConfig = {
      FunctionName: trigger.lambdaFunctionName
    }

    console.log('Publishing new Lambda version with the following config:', lambdaConfig)

    if (config.dryRun) {
      console.log('[DRY RUN]: Not publishing new Lambda versions')
      continue
    }

    await lambda.publishVersion(lambdaConfig).promise()

    console.log('Successfully published new Lambda version.')
  }
}

/**
 * Sets the Lambda@Edge triggers for the specified Lambda functions on the specified CloudFront distribution
 *
 * @param config The project configuration to update
 *
 * @return {Promise<void>}
 */
const activateLambdas = async (config) => {
  if (!validateConfig(config, ['cfDistributionID', 'cacheBehaviorPath'], ['lambdaFunctionName'])) {
    throw new Error('Invalid config.')
  }

  // first, get the CF distro
  const distroConfig = await getCloudFrontDistributionConfig(config.cfDistributionID, config.awsRegion)

  const lambdaARNs = {}
  await Promise.all(config.cfTriggers
    .map(async trigger => {
      lambdaARNs[trigger.cfTriggerName] = (await getLambdaVersion(trigger.lambdaFunctionName, config.awsRegion, config.autoIncrementVersion ? '' : trigger.lambdaFunctionVersion)).FunctionArn
    }))

  console.log('Activating the following ARNs:', lambdaARNs)

  const cacheBehaviorPath = config.cacheBehaviorPath

  // then, set the arns in the config (filter out missing arns)
  const updatedConfig = Object.entries(lambdaARNs)
    .filter(([, arn]) => !!arn)
    .reduce((config, [triggerName, arn]) => changeCloudFrontDistributionLambdaARN(config, cacheBehaviorPath, arn, triggerName), distroConfig)

  // do not update if this is a dry run
  if (config.dryRun) {
    console.log('[DRY RUN]: Not updating CloudFront distribution triggers')
    return
  }

  // finally, update the distro
  await updateCloudFrontDistribution(config.cfDistributionID, updatedConfig, config.awsRegion)

  console.log('Successfully activated new Lambdas.')
}

module.exports = {
  pushNewCodeBundles,
  deployLambdas,
  publishLambdas,
  activateLambdas,
  validateConfig,
}

