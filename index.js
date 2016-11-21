var fs = require('fs');
var AWS = require('aws-sdk');
var extend = require('util')._extend;
var async = require('async');

exports.deploy = function(codePackage, config, callback, logger, lambda) {
  if (!logger) {
    logger = console.log;
  }

  if(!lambda) {
    if("profile" in config) {
      var credentials = new AWS.SharedIniFileCredentials({profile: config.profile});
      AWS.config.credentials = credentials;
    }

    if (process.env.HTTPS_PROXY) {
      if (!AWS.config.httpOptions) {
        AWS.config.httpOptions = {};
      }
      var HttpsProxyAgent = require('https-proxy-agent');
      AWS.config.httpOptions.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }

    lambda = new AWS.Lambda({
      region: config.region,
      accessKeyId: "accessKeyId" in config ? config.accessKeyId : "",
      secretAccessKey: "secretAccessKey" in config ? config.secretAccessKey : "",
      sessionToken: "sessionToken" in config ? config.sessionToken : ""
    });
  }

  var params = {
    FunctionName: config.functionName,
    Description: config.description,
    Handler: config.handler,
    Role: config.role,
    Timeout: config.timeout,
    MemorySize: config.memorySize
  };
  if (config.vpc) params.VpcConfig = config.vpc;
  if (config.environment) params.Environment = config.environment;
  var isPublish = (config.publish === true);

  var updateEventSource = function(eventSource, callback) {
    var params = extend({
      FunctionName: config.functionName
    }, eventSource);

    lambda.listEventSourceMappings({
      FunctionName: params.FunctionName,
      EventSourceArn: params.EventSourceArn
    }, function(err, data) {
      if(err) {
        logger("List event source mapping failed, please make sure you have permission");
        callback(err);
      } else {
        if (data.EventSourceMappings.length === 0) {
          lambda.createEventSourceMapping(params, function(err, data) {
            if(err) {
              logger("Failed to create event source mapping!");
              callback(err);
            } else {
              callback();
            }
          });
        } else {
          async.eachSeries(data.EventSourceMappings, function(mapping, iteratorCallback) {
            lambda.updateEventSourceMapping({
              UUID: mapping.UUID,
              BatchSize: params.BatchSize
            }, iteratorCallback);
          }, function(err) {
            if(err) {
              logger("Update event source mapping failed");
              callback(err);
            } else {
              callback();
            }
          });
        }
      }
    });
  };

  var updateEventSources = function(callback) {
    var eventSources;

    if(!config.eventSource) {
      callback();
      return;
    }

    eventSources = Array.isArray(config.eventSource) ? config.eventSource : [ config.eventSource ];

    async.eachSeries(
      eventSources,
      updateEventSource,
      function(err) {
        callback(err);
      }
    );
  };

  var updateFunction = function(callback) {
    fs.readFile(codePackage, function(err, data) {
      if(err) {
        return callback('Error reading specified package "'+ codePackage + '"');
      }

      lambda.updateFunctionCode({FunctionName: params.FunctionName, ZipFile: data, Publish: isPublish}, function(err, data) {
        if (err) {
          var warning = 'Package upload failed. '
          warning += 'Check your iam:PassRole permissions.'
          logger(warning);
          callback(err)
        } else {
          lambda.updateFunctionConfiguration(params, function(err, data) {
            if (err) {
              var warning = 'Update function configuration failed. '
              logger(warning);
              callback(err);
            } else {
              updateEventSources(callback);
            }
          });
        }
      });
    });
  };

  var createFunction = function(callback) {
    fs.readFile(codePackage, function(err, data) {
      if(err) {
        return callback('Error reading specified package "'+ codePackage + '"');
      }

      params['Code'] = { ZipFile: data };
      params['Runtime'] = "runtime" in config ? config.runtime : "nodejs4.3";
      params['Publish'] = isPublish;
      lambda.createFunction(params, function(err, data) {
        if (err) {
          var warning = 'Create function failed. '
          warning += 'Check your iam:PassRole permissions.'
          logger(warning);
          callback(err)
        } else {
          updateEventSources(callback);
        }
      });
    });
  };


  lambda.getFunction({FunctionName: params.FunctionName}, function(err, data) {
    if (err) {
      if (err.statusCode === 404) {
        createFunction(callback);
      } else {
        var warning = 'AWS API request failed. '
        warning += 'Check your AWS credentials and permissions.'
        logger(warning);
        callback(err);
      }
    } else {
      updateFunction(callback);
    }
  });
};
