var fs = require('fs');
var util = require('util');
var extend = util._extend;
var awsLambda = require('../index');
var expect = require('chai').expect;
var FakeLambdaService = require('./fake-lambda-service');
var logger = console.log;
var async = require('async');

function failOnError(callback) {
  return function(err) {
    if(err) { callback(err); }
  };
}

describe('node aws lambda module', function() {
  var service;
  var packageV1 = 'test/helloworld-v1.zip';
  var packageV2 = 'test/helloworld-v2.zip';
  var sampleConfig = {
    region: 'us-west-1',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    handler: 'helloworld.handler',
    role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
    functionName: 'helloworld',
    description: 'helloworld description',
    timeout: 10,
    memorySize: 128,
    publish: true,
    vpc: {
      SecurityGroupIds: ['sg-xxxxxxx1', 'sg-xxxxxxx2'],
      SubnetIds: ['subnet-xxxxxxxx']
    },
    eventSource: {
      EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0",
      BatchSize: 200,
      StartingPosition: "TRIM_HORIZON"
    },
    environment: {
      Variables: {
        SOME_KEY: 'SOME_VALUE'
      }
    }
  };

  var sampleConfigPython = {
    region: 'us-west-1',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    handler: 'helloworld.handler',
    role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
    functionName: 'helloworld',
    description: 'helloworld description',
    timeout: 10,
    memorySize: 128,
    runtime: "python2.7",
    eventSource: {
      EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0",
      BatchSize: 200,
      StartingPosition: "TRIM_HORIZON"
    }
  };


  var deploy = function(packagePath, config, callback) {
    awsLambda.deploy(packagePath, config, callback, logger, service);
  };

  beforeEach(function() {
    service = new FakeLambdaService();
  });

  it('should create the function with code, configuration and event source mapping on fresh deployment', function(done) {
    async.waterfall([
      function(callback) {
        deploy(packageV1, sampleConfig, callback);
      },

      function(callback) {
        service.getFunction({FunctionName: 'helloworld'}, callback);
      },

      function(data, callback) {
        expect(data.Configuration).to.deep.equal({
          FunctionName: 'helloworld',
          Description: 'helloworld description',
          Handler: 'helloworld.handler',
          Role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
          Timeout: 10,
          MemorySize: 128,
          Publish: true,
          Runtime: "nodejs4.3",
          VpcConfig: {
            SecurityGroupIds: ['sg-xxxxxxx1', 'sg-xxxxxxx2'],
            SubnetIds: ['subnet-xxxxxxxx']
          },
          Environment: {
            Variables: {
              SOME_KEY: 'SOME_VALUE'
            }
          }
        });
        expect(data.Code.Content.toString()).to.equal(fs.readFileSync(packageV1).toString());
        service.listEventSourceMappings({FunctionName: 'helloworld', EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0"}, callback);
      },

      function(data, callback) {
        expect(data.EventSourceMappings.length).to.equal(1);
        expect(data.EventSourceMappings[0].BatchSize).to.equal(200);
        expect(data.EventSourceMappings[0].StartingPosition).to.equal("TRIM_HORIZON");
        callback();
      }
    ], done);
  });

  it("should update the code and configuration on next deploys", function(done) {
    async.waterfall([
      function(callback) {
        deploy(packageV1, sampleConfig, callback);
      },

      function(callback) {
        var newConfig = extend({}, sampleConfig);
        newConfig.timeout = 20;
        newConfig.memorySize = 128;
        newConfig.publish = false;
        newConfig.vpc = {
          SecurityGroupIds: ['sg-xxxxxxx3'],
          SubnetIds: ['subnet-xxxxxxx1','subnet-xxxxxxx2']
        };
        newConfig.eventSource = {
          EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0",
          BatchSize: 50,
          StartingPosition: "LATEST"
        };
        newConfig.environment = {
          Variables: {
            SOME_KEY: 'SOME_CHANGED_VALUE',
            SOME_NEW_KEY: 'SOME_NEW_VALUE'
          }
        }

        deploy(packageV2, newConfig, callback);
      },

      function(callback) {
        service.getFunction({FunctionName: 'helloworld'}, callback);
      },

      function(data, callback) {
        expect(data.Configuration).to.deep.equal({
          FunctionName: 'helloworld',
          Description: 'helloworld description',
          Handler: 'helloworld.handler',
          Role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
          Timeout: 20,
          MemorySize: 128,
          Publish: false,
          Runtime: "nodejs4.3",
          VpcConfig: {
            SecurityGroupIds: ['sg-xxxxxxx3'],
            SubnetIds: ['subnet-xxxxxxx1', 'subnet-xxxxxxx2']
          },
          Environment: {
            Variables: {
              SOME_KEY: 'SOME_CHANGED_VALUE',
              SOME_NEW_KEY: 'SOME_NEW_VALUE'
            }
          }
        });

        expect(data.Code.Content.toString()).to.equal(fs.readFileSync(packageV2).toString());
        service.listEventSourceMappings({FunctionName: 'helloworld', EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0"}, callback);
      },

      function(data, callback) {
        expect(data.EventSourceMappings.length).to.equal(1);
        expect(data.EventSourceMappings[0].BatchSize).to.equal(50);
        callback();
      }
    ], done);
  });

  it('should create the function with runtime configuration', function(done){
    async.waterfall([
      function(callback) {
        deploy(packageV1, sampleConfigPython, callback);
      },

      function(callback) {
        service.getFunction({FunctionName: 'helloworld'}, callback);
      },

      function(data, callback) {
        expect(data.Configuration).to.deep.equal({
          FunctionName: 'helloworld',
          Description: 'helloworld description',
          Handler: 'helloworld.handler',
          Role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
          Timeout: 10,
          Runtime: "python2.7",
          MemorySize: 128,
          Publish: false
        });
        callback()
      }
    ], done);
  });

  it("should not deploy function unless package can be found", function(done) {
    deploy('not-exist', sampleConfig, function(err) {
      expect(err).to.equal('Error reading specified package "not-exist"');
      done();
    });
  });

  it("should not update function unless package can be found", function(done) {
    deploy(packageV1, sampleConfig, function(err) {
      if(err) { return done(error); }
      deploy("not-exist", sampleConfig, function(err) {
        expect(err).to.equal('Error reading specified package "not-exist"');
        done();
      });
    });
  });

  it("should skip event source setup if no configuration is given", function(done) {
    var newConfig = extend({}, sampleConfig);
    delete newConfig.eventSource;
    deploy(packageV1, newConfig, function(err) {
      expect(err).to.be.a("undefined");
      expect(service.eventSourceMappingCount('helloworld')).to.equal(0);
      done();
    });
  });

  it("should be able to set multiple event sources", function(done) {
    var newEventSource = {
        EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x1",
        BatchSize: 500,
        StartingPosition: "LATEST"
      },
      newConfig = extend({}, sampleConfig);

    newConfig.eventSource = [ newConfig.eventSource, newEventSource ];
    deploy(packageV1, newConfig, function(err) {
      expect(service.eventSourceMappingCount('helloworld')).to.equal(newConfig.eventSource.length);
      done();
    });
  });
});
