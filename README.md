# update-lambda-edge

Provides some handy functions for pushing new code to Lambda@Edge and updating CloudFront triggers.

## Install

```sh
$ npm i update-lambda-edge -g
```

## Usage

```sh
$ update-lambda-edge --help
```

Help output:

```
update-lambda-edge [command]

Commands:
  update-lambda-edge push      Pushes a ZIP file containing Lambda code to S3
  update-lambda-edge deploy    Updates the code of an existing Lambda function
                               with a new ZIP file in S3
  update-lambda-edge publish   Publishes a new Lambda version
  update-lambda-edge activate  Activates the latest versions of Lambda@Edge
                               functions on specified CloudFront distribution

Options:
      --version  Show version number                                   [boolean]
      --help     Show help                                             [boolean]
  -r, --region   The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run  If true, will only print out debug info; it will not update
                 anything in AWS                                       [boolean]
```

## Available commands

* [push](#push)
* [deploy](#deploy)
* [publish](#publish)
* [activate](#activate)

### push

```sh
$ update-lambda-edge push --help
```

Help output:

```
update-lambda-edge push

Pushes a ZIP file containing Lambda code to S3

Options:
      --version         Will append this version number to the file name
                        (ignored if "auto-increment" is true)           [string]
      --help            Show help                                      [boolean]
  -r, --region          The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run         If true, will only print out debug info; it will not
                        update anything in AWS                         [boolean]
      --bucket          The name of the S3 bucket to push the ZIP file to
                                                             [string] [required]
      --key             The file path to the ZIP file in the S3 bucket
                                                             [string] [required]
      --file-path       The relative file path to the ZIP file on local FS
                                                             [string] [required]
      --function-name   If auto-increment is true, this is required to determine
                        the next Lambda version number                  [string]
      --auto-increment  If true, will append the file name with the next Lambda
                        version                       [boolean] [default: false]
      --pwd             Set the present working directory
              [string] [default: <cwd>]
```

### deploy

```sh
$ update-lambda-edge deploy --help
```

Help output:

```
update-lambda-edge deploy

Updates the code of an existing Lambda function with a new ZIP file in S3

Options:
      --version           Will append this version number to the file name
                          (ignored if "use-next-version" is true)       [string]
      --help              Show help                                    [boolean]
  -r, --region            The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run           If true, will only print out debug info; it will not
                          update anything in AWS                       [boolean]
      --bucket            The name of the S3 bucket where the ZIP file lives
                                                             [string] [required]
      --key               The file path to the ZIP file in the S3 bucket
                                                             [string] [required]
      --function-name     The name of the Lambda function to update
                                                             [string] [required]
      --use-next-version  If true, look for a ZIP file with the next Lambda
                          version appended to the name[boolean] [default: false]
```

### 

```sh
$ update-lambda-edge  --help
```

Help output:

```
update-lambda-edge [command]

Commands:
  update-lambda-edge push      Pushes a ZIP file containing Lambda code to S3
  update-lambda-edge deploy    Updates the code of an existing Lambda function
                               with a new ZIP file in S3
  update-lambda-edge publish   Publishes a new Lambda version
  update-lambda-edge activate  Activates the latest versions of Lambda@Edge
                               functions on specified CloudFront distribution

Options:
      --version  Show version number                                   [boolean]
      --help     Show help                                             [boolean]
  -r, --region   The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run  If true, will only print out debug info; it will not update
                 anything in AWS                                       [boolean]
```

### publish

```sh
$ update-lambda-edge publish --help
```

Help output:

```
update-lambda-edge publish

Publishes a new Lambda version

Options:
      --version        Show version number                             [boolean]
      --help           Show help                                       [boolean]
  -r, --region         The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run        If true, will only print out debug info; it will not
                       update anything in AWS                          [boolean]
      --function-name  The name of the Lambda function to publish
                                                             [string] [required]
```

### activate

```sh
$ update-lambda-edge activate --help
```

Help output:

```
update-lambda-edge activate

Activates the latest versions of Lambda@Edge functions on specified CloudFront
distribution

Options:
      --version          Show version number                           [boolean]
      --help             Show help                                     [boolean]
  -r, --region           The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run          If true, will only print out debug info; it will not
                         update anything in AWS                        [boolean]
  -d, --distribution-id  The CloudFront distribution ID      [string] [required]
      --viewer-request   The name of the function to be deployed at the Viewer
                         Request event                                  [string]
      --origin-request   The name of the function to be deployed at the Origin
                         Request event                                  [string]
      --origin-response  The name of the function to be deployed at the Origin
                         Response event                                 [string]
      --viewer-response  The name of the function to be deployed at the Viewer
                         Response event                                 [string]
```

### 

```sh
$ update-lambda-edge  --help
```

Help output:

```
update-lambda-edge [command]

Commands:
  update-lambda-edge push      Pushes a ZIP file containing Lambda code to S3
  update-lambda-edge deploy    Updates the code of an existing Lambda function
                               with a new ZIP file in S3
  update-lambda-edge publish   Publishes a new Lambda version
  update-lambda-edge activate  Activates the latest versions of Lambda@Edge
                               functions on specified CloudFront distribution

Options:
      --version  Show version number                                   [boolean]
      --help     Show help                                             [boolean]
  -r, --region   The region that the base Lambdas are running
                                                 [string] [default: "us-east-1"]
      --dry-run  If true, will only print out debug info; it will not update
                 anything in AWS                                       [boolean]
```

## License

MIT.
