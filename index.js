const fs = require('fs')
const AWS = require('aws-sdk')

const getLatestLambdaVersion = async (functionName, region) => {
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

  if (!versions.length) {
    return ''
  }

  return versions.filter(version => version.Version !== '$LATEST').sort((a, b) => Number(b.Version) - Number(a.Version))[0]
}

const getCloudFrontDistributionConfig = async (distributionID, region) => {
  const cloudfront = new AWS.CloudFront({
    apiVersion: '2020-05-31',
    region
  })

  return cloudfront.getDistributionConfig({
    Id: distributionID
  }).promise()
}

const changeCloudFrontDistributionLambdaARN = (distributionConfig, lambdaARN, triggerName) => {
  try {
    const lambdaFunction = distributionConfig.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Items.find(item => item.EventType === triggerName)

    if (lambdaFunction.LambdaFunctionARN !== lambdaARN) {
      lambdaFunction.LambdaFunctionARN = lambdaARN
    }
  } catch (e) {}

  return distributionConfig
}

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
 * @param {string} bucket The name of the S3 bucket that the ZIP file resides in
 * @param {string} key The path to the ZIP file in the S3 bucket (must end in .zip)
 * @param {string} filePath Absolute path to ZIP file (must end in .zip)
 * @param {string} functionName The name of the function to update
 * @param {boolean} autoIncrement If true, will append the next Lambda version number to the ZIP file name (functionName is required if true)
 * @param {string} version A version to append to the ZIP file name (ignored if autoIncrement is true)
 * @param {string} region The region the Lambda lives
 * @param {boolean} dryRun If true, will not push to S3
 *
 * @return {Promise<void>}
 */
const pushNewCodeBundle = async ({bucket, key, filePath, functionName, autoIncrement, version, region, dryRun}) => {
  const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    region
  })

  if (functionName && autoIncrement) {
    version = `${Number((await getLatestLambdaVersion(functionName, region)).Version) + 1}`
  }

  if (version) {
    key = key.replace(/\.zip$/, `-${version}.zip`)
  }

  const config = {
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(filePath)
  }

  console.log('Pushing to S3 with the following config:', config)

  if (dryRun) {
    return
  }

  await s3.upload(config).promise()

  console.log('Successfully pushed to S3.')
}

/**
 * Updates a Lambda function's code with a ZIP file in S3
 *
 * @param {string} bucket The name of the S3 bucket that the ZIP file resides in
 * @param {string} key The path to the ZIP file in the S3 bucket (must end in ".zip")
 * @param {string} functionName The name of the function to update
 * @param {boolean} useNextVersion If true, will append the next Lambda version number to the key
 * @param {string} version A version to append to the key (ignored if useNextVersion is true)
 * @param {string} region The region the Lambda lives
 * @param {boolean} dryRun If true, will not update the Lambda code
 *
 * @return {Promise<void>}
 */
const deployLambda = async ({bucket, key, functionName, useNextVersion, version, region, dryRun}) => {
  const lambda = new AWS.Lambda({
    apiVersion: '2015-03-31',
    region
  })

  if (useNextVersion) {
    version = `${Number((await getLatestLambdaVersion(functionName, region)).Version) + 1}`
  }

  if (version) {
    key = key.replace(/\.zip$/, `-${version}.zip`)
  }

  const config = {
    FunctionName: functionName,
    S3Bucket: bucket,
    S3Key: key
  }

  console.log('Updating Lambda code with the following config', config)
  if (dryRun) {
    return
  }

  await lambda.updateFunctionCode(config).promise()

  console.log('Successfully deployed new code.')
}

/**
 * Publishes a new version of a Lambda function
 *
 * @param {string} functionName The name of the function to update
 * @param {string} region The region the Lambda lives
 * @param {boolean} dryRun If true, will not publish a new Lambda version
 *
 * @return {Promise<void>}
 */
const publishLambda = async ({functionName, region, dryRun}) => {
  const lambda = new AWS.Lambda({
    apiVersion: '2015-03-31',
    region
  })

  const config = {
    FunctionName: functionName
  }

  console.log('Publishing new Lambda version with the following config:', config)
  if (dryRun) {
    return
  }

  await lambda.publishVersion().promise()

  console.log('Successfully published new Lambda version.')
}

/**
 * Sets the Lambda@Edge triggers for the specified Lambda functions on the specified CloudFront distribution
 *
 * @param {string} distributionId The CloudFront distribution ID
 * @param {string} viewerRequest The name of the function to execute when "Viewer Request" is triggered
 * @param {string} originRequest The name of the function to execute when "Origin Request" is triggered
 * @param {string} originResponse The name of the function to execute when "Origin Response" is triggered
 * @param {string} viewerResponse The name of the function to execute when "Viewer Response" is triggered
 * @param {string} region The region the Lambda lives
 * @param {boolean} dryRun If true, will not update the CloudFront triggers
 *
 * @return {Promise<void>}
 */
const activateLambdas = async ({distributionId, viewerRequest, originRequest, originResponse, viewerResponse, region, dryRun}) => {
  console.log({distributionId, viewerRequest, originRequest, originResponse, viewerResponse, region, dryRun})

  // first, get the CF distro
  const distroConfig = await getCloudFrontDistributionConfig(distributionId, region)

  // then, get the latest Lambda ARNs
  const lambdaConfigs = {
    'viewer-request': viewerRequest,
    'origin-request': originRequest,
    'origin-response': originResponse,
    'viewer-response': viewerResponse
  }
  const lambdaARNs = {}
  await Promise.all(Object.entries(lambdaConfigs)
    .filter(([, functionName]) => !!functionName)
    .map(async ([triggerName, functionName]) => {
      lambdaARNs[triggerName] = (await getLatestLambdaVersion(functionName, 'us-east-1')).FunctionArn
    }))

  console.log('Activating the following ARNs:', lambdaARNs)

  // then, set the arns in the config
  const updatedConfig = Object.entries(lambdaARNs)
    .filter(([, functionName]) => !!functionName)
    .reduce((config, [triggerName, arn]) => changeCloudFrontDistributionLambdaARN(config, arn, triggerName), distroConfig)

  // do not update if this is a dry run
  if (dryRun) {
    return
  }

  // finally, update the distro
  await updateCloudFrontDistribution(distributionId, updatedConfig, region)

  console.log('Successfully activated new Lambdas.')
}

module.exports = {
  pushNewCodeBundle,
  deployLambda,
  publishLambda,
  activateLambdas,
}

