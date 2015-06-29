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
    handler: 'helloworld.handler',
    role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
    functionName: 'helloworld',
    timeout: 10,
    eventSource: {
      EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0",
      BatchSize: 200,
      StartingPosition: "TRIM_HORIZON"
    }
  };

  var deploy = function(packagePath, config, callback) {
    awsLambda.deploy(packagePath, config, callback, logger, service);
  }

  beforeEach(function() {
    service = new FakeLambdaService();
  });

  it('should create the function with code, configuration and event source mapping on fresh deployment', function(done){
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
          Handler: 'helloworld.handler',
          Role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
          Timeout: 10,
          Runtime: "nodejs"
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
        newConfig.eventSource = {
          EventSourceArn: "arn:aws:kinesis:us-east-1:xxx:stream/KinesisStream-x0",
          BatchSize: 50,
          StartingPosition: "LATEST"
        };

        deploy(packageV2, newConfig, callback);
      },

      function(callback) {
        service.getFunction({FunctionName: 'helloworld'}, callback);
      },

      function(data, callback) {
        expect(data.Configuration).to.deep.equal({
          FunctionName: 'helloworld',
          Handler: 'helloworld.handler',
          Role: 'arn:aws:iam:xxxxxx:rol/lambda-exec-role',
          Timeout: 20,
          Runtime: "nodejs"
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
});
