# node-aws-lambda [![npm version](https://badge.fury.io/js/node-aws-lambda.svg)](http://badge.fury.io/js/node-aws-lambda) [![Build Status](https://snap-ci.com/ThoughtWorksStudios/node-aws-lambda/branch/master/build_image)](https://snap-ci.com/ThoughtWorksStudios/node-aws-lambda/branch/master)
[Built with :yellow_heart: and :coffee: in San Francisco](http://www.thoughtworks.com/mingle/team/)

A module helps you automate AWS lambda function deployment.
All lambda configuration is managed in the codebase, includes event source mappings. So you can version control everything and automate the deployment instead of click click click in AWS console.

Inspired by https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6

# Gulp example:

gulpfile.js
```node
var gulp = require('gulp');
var zip = require('gulp-zip');
var del = require('del');
var install = require('gulp-install');
var runSequence = require('run-sequence');
var awsLambda = require("node-aws-lambda");

gulp.task('clean', function() {
  return del(['./dist', './dist.zip']);
});

gulp.task('js', function() {
  return gulp.src('index.js')
    .pipe(gulp.dest('dist/'));
});

gulp.task('node-mods', function() {
  return gulp.src('./package.json')
    .pipe(gulp.dest('dist/'))
    .pipe(install({production: true}));
});

gulp.task('zip', function() {
  return gulp.src(['dist/**/*', '!dist/package.json'])
    .pipe(zip('dist.zip'))
    .pipe(gulp.dest('./'));
});

gulp.task('upload', function(callback) {
  awsLambda.deploy('./dist.zip', require("./lambda-config.js"), callback);
});

gulp.task('deploy', function(callback) {
  return runSequence(
    ['clean'],
    ['js', 'node-mods'],
    ['zip'],
    ['upload'],
    callback
  );
});
```
lambda-config.js

```node
module.exports = {
  accessKeyId: <access key id>,  // optional
  secretAccessKey: <secret access key>,  // optional
  sessionToken: <sessionToken for assuming roles>,  // optional
  profile: <shared credentials profile name>, // optional for loading AWS credientail from custom profile
  region: 'us-east-1',
  handler: 'index.handler',
  role: <role arn>,
  functionName: <function name>,
  timeout: 10,
  memorySize: 128,
  publish: true, // default: false,
  runtime: 'nodejs4.3', // default: 'nodejs4.3',
  vpc: { // optional
    SecurityGroupIds: [<security group id>, ...],
    SubnetIds: [<subnet id>, ...]
  },
  eventSource: {
    EventSourceArn: <event source such as kinesis ARN>,
    BatchSize: 200,
    StartingPosition: "TRIM_HORIZON"
  },
  environment: { // optional
    Variables: {
      someKey: 'STRING_VALUE'
    }
  }
}
````

# Proxy setup
Deployment via https proxy is supported by setting environment variable "HTTPS_PROXY". For example:

```terminal
> HTTPS_PROXY="https://myproxy:8080" gulp deploy
```

# License

(The MIT License)

Copyright (c) 2015 ThoughtWorks Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
