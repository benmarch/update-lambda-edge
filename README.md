# Update Lambda@Edge

Provides some handy functions for pushing new code to Lambda@Edge and updating CloudFront triggers.

Can be easily integrated into a CI/CD pipeline, or used as an ad-hoc CLI for managing Lambda@Edge functions.

## Install

To install this as a global command line tool:

```sh
$ npm i update-lambda-edge -g
```

To install in a project for use in an NPM script:

```sh
$ npm i -D update-lambda-edge
```

To use without installing globally:

```sh
$ npx update-lambda-edge [command] [...options]
```

## Usage

There are four commands for deploying changes to Lambda@Edge functions:

- `push`: Pushes a Lambda ZIP file to S3 so that it can be deployed later
- `deploy`: Deploys the code in the ZIP file to the Lambda
- `publish`: Publishes a new version of the Lambda because Lambda@Edge requires versions to be explicitly references ("$LATEST" is not allowed)
- `activate`: Updates the CloudFront configuration to point to the newly published (or previously published) Lambda version

### Ad-hoc Usage

All commands can be executed ad-hoc. That is, each required option can be specified each time the command is executed.
For example, to execute `push`, all of the following options are required:

```sh
$ update-lambda-edge push --bucket my-s3-bucket --key path/to/code-bundle.zip --file-path dist/local/code-bundle.zip --function-name my-viewer-request-lambda
```

It is quite verbose, but manageable when it does not need to be executed often and there is only a single Lambda.

### Configuration File

The preferred way is to use a configuration file that specifies information about all Lambda@Edge functions for a specific CloudFront distribution.
Even if there is only one Lambda@Edge function attached to the distribution, the configuration file can simplify the commands considerably.

Start with this configuration file template and modify to fit your needs (triggers can be removed if not used):
```json
{
  "awsRegion": "us-east-1",
  "autoIncrementVersion": true,
  "cfDistributionID": "1XY234ABC",
  "lambdaCodeS3Bucket": "my-s3-bucket",
  "cfTriggers": [
    {
      "cfTriggerName": "viewer-request",
      "lambdaFunctionName": "my-viewer-request-lambda",
      "lambdaCodeS3Key": "path/to/code-bundle.zip",
      "lambdaCodeFilePath": "dist/local/code-bundle.zip"
    },
    {
      "cfTriggerName": "origin-request",
      "lambdaFunctionName": "my-origin-request-lambda",
      "lambdaCodeS3Key": "path/to/code-bundle.zip",
      "lambdaCodeFilePath": "dist/local/code-bundle.zip"
    },
    {
      "cfTriggerName": "origin-response",
      "lambdaFunctionName": "my-origin-response-lambda",
      "lambdaCodeS3Key": "path/to/code-bundle.zip",
      "lambdaCodeFilePath": "dist/local/code-bundle.zip"
    },
    {
      "cfTriggerName": "viewer-response",
      "lambdaFunctionName": "my-viewer-response-lambda",
      "lambdaCodeS3Key": "path/to/code-bundle.zip",
      "lambdaCodeFilePath": "dist/local/code-bundle.zip"
    },
  ]
}
```

Using a configuration file, the same command above looks like this:

```sh
$ update-lambda-edge push --config cloudfront-config.json --vreq
```

Much simpler. The `--vreq` option specifies that only the Viewer Request code bundle should be pushed to S3. 
**Omitting all trigger specifiers will act on all configured triggers.**

Each option specified in the configuration file can be overridden with command line options.
For example, to push to a different location in the S3 bucket as a one-off, you can specify a different key:

```sh
$ update-lambda-edge push --config cloudfront-config.json --key new/location/in/the/same/bucket/code-bundle.zip --vreq
```

### Lambda Versioning

By default, each command will auto-increment the version of the Lambda. This works by retrieving all the version information
for the specified Lambda function, finds the latest, then increments it by 1. This behavior can be overridden by specifying
a specific version number using the `--lambda-version` CLI option (there is no configuration file option).

How auto-incrementing affects each command:

- `push`: Appends the next version number to the S3 Key. Example: `path/to/code-bundle-5.zip` (assuming version 4 of the Lambda is the latest).
- `deploy`: Looks for the zip file with the next version number appended. Same example as `push`.
- `publish`: No effect. Publishing a Lambda always auto-increments, which is why the functionality is mirrored in this library.
- `activate`: Activates the _latest_ version of the Lambda, even if it is not sequentially next. Example: if the active version is 3, but version 5 is the latest published version, then version 5 is activated.

### Global Options

The following options are global to all commands:

- `--dry-run`: Executes the command but does not make any changes in AWS. Note: it still needs to access AWS for metadata such as Lambda versions and CloudFront configurations. 
- `--pwd`: Sets the present working directory. All relative paths (for config file and local file path) will resolve from this value. Defaults to `process.cwd()`
- `--region`: Sets the AWS region. Defaults to `'us-east-1'`
- `--config`: The path to the configuration file (can be relative to pwd or absolute)
- `--vreq`: If using a configuration file, executes the command for the Viewer Request trigger (if configured)
- `--oreq`: If using a configuration file, executes the command for the Origin Request trigger (if configured)
- `--ores`: If using a configuration file, executes the command for the Origin Response trigger (if configured)
- `--vres`: If using a configuration file, executes the command for the Viewer Response trigger (if configured)

## Available commands

* [push](#push)
* [deploy](#deploy)
* [publish](#publish)
* [activate](#activate)

### push

Pushes a Lambda ZIP file to S3 so that it can be deployed later.

#### Required options

- S3 Bucket
    - CLI: `--bucket`
    - Config: `lambdaCodeS3Bucket`
- Lambda function name
    - CLI: `--function-name`
    - Config: `cfTriggers[].lambdaFunctionName`
- S3 Key to store code bundle (must be a .zip file)
    - CLI: `--key`
    - Config: `cfTriggers[].lambdaCodeS3Key`
- Path to local code bundle (must be a .zip file)
    - CLI: `--file-path`
    - Config: `cfTriggers[].lambdaCodeFilePath`

#### Optional options

- Lambda code version (overrides auto-increment)
    - CLI: `--lambda-version`
    - Config: none
    - Note: if auto-increment is set to `false` and no version is specified, then the base S3 Key is used with no version number appended.
  
### deploy

Deploys the code in a ZIP file to the Lambda.

#### Required options

- S3 Bucket
    - CLI: `--bucket`
    - Config: `lambdaCodeS3Bucket`
- Lambda function name
    - CLI: `--function-name`
    - Config: `cfTriggers[].lambdaFunctionName`
- S3 Key to store code bundle (must be a .zip file)
    - CLI: `--key`
    - Config: `cfTriggers[].lambdaCodeS3Key`

#### Optional options

- Lambda code version (overrides auto-increment)
    - CLI: `--lambda-version`
    - Config: none
    - Note: if auto-increment is set to `false` and no version is specified, then the base S3 Key is used with no version number appended.
  
### publish

Publishes a new version of the Lambda and gives it the next sequential version number.

#### Required options

- Lambda function name
    - CLI: `--function-name`
    - Config: `cfTriggers[].lambdaFunctionName`
  
### activate

Updates the CloudFront configuration to point to the newly published (or previously published) Lambda version.

#### Required options

- CloudFront Distribution ID
    - CLI: `--distribution-id`
    - Config: `cfDistributionID`
- Lambda function name
    - CLI: `--function-name`
    - Config: `cfTriggers[].lambdaFunctionName`

#### Optional options

- Lambda code version (overrides auto-increment)
    - CLI: `--lambda-version`
    - Config: none
    - Note: unless the version number is explicitly set, this command will activate the latest version.

## Integrating Into a CI/CD Pipeline

There are many ways to do this, but this is how I have set it up with my monorepo and NPM scripts.
Note: I'm not showing it here, but I have also paired this with Lerna so that only changed Lambdas are deployed.

First, create separate configuration files for each environment:

- config-dev.json
- config-qa.json
- config-prod.json

Then, set up some NPM scripts:
```json
{
  "scripts": {
    "lambda:push": "update-lambda-edge push --config config-${DEPLOY_ENV}.json",
    "lambda:deploy": "update-lambda-edge deploy --config config-${DEPLOY_ENV}.json",
    "lambda:publish": "update-lambda-edge publish --config config-${DEPLOY_ENV}.json",
    "lambda:activate": "update-lambda-edge activate --config config-${DEPLOY_ENV}.json",
    "env:dev": "DEPLOY_ENV=dev npm run",
    "env:qa": "DEPLOY_ENV=qa npm run",
    "env:prod": "DEPLOY_ENV=prod npm run"
  }
}
```

The "env:xxx" commands are pretty handy...

I am using a Jenkins Multibranch Pipeline, so in my "Deploy - Dev" stage I run the following commands:

```
// ...
stage('Deploy - Dev') {
  when {
    branch dev
  }
  
  steps {
    sh ''' \
      npm run env:dev -- lambda:push
      npm run env:dev -- lambda:deploy
      npm run env:dev -- lambda:publish
      npm run env:dev -- lambda:activate    
    '''
  }
}
// ...
```

And my "Deploy - QA" stage:

```
// ...
stage('Deploy - QA') {
  when {
    branch release
  }
  
  steps {
    sh ''' \
      npm run env:qa -- lambda:push
      npm run env:qa -- lambda:deploy
      npm run env:qa -- lambda:publish
      npm run env:qa -- lambda:activate    
      
      // just push the code bundle to Prod S3 bucket, don't activate it yet, though
      npm run env:prod -- lambda:push
    '''
  }
}
// ...
```

Then I have a downstream job to run the rest of the Prod commands to activate them.

## Known Limitations

- Currently, this will only modify triggers on the default cache behavior of a CloudFront distribution. 
  If requested, support for additional behaviors can be added.

## Contributing

Feel free to open a pull request.

## License

ISC
