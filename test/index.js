// @flow

import { stat } from 'fs';
import { AWS } from 'aws-sdk';
import { extend } from 'util-extend';
import { async } from 'async';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { loggerpro } from 'loggerpro';

exports.deploy = (codePackage: string, config: any, callback: any, logger: any, lambda: any) => {
  let loggerImpl;
  let lambdaNew = lambda;

  if (!logger) {
    loggerImpl = loggerpro;
  }

  if (!lambdaNew) {
    if ('profile' in config) {
      const credentials = new AWS.SharedIniFileCredentials({ profile: config.profile });
      AWS.config.credentials = credentials;
    }

    if (process.env.HTTPS_PROXY) {
      if (!AWS.config.httpOptions) {
        AWS.config.httpOptions = {};
      }
      AWS.config.httpOptions.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }

    lambdaNew = new AWS.Lambda({
      region: config.region,
      accessKeyId: 'accessKeyId' in config ? config.accessKeyId : '',
      secretAccessKey: 'secretAccessKey' in config ? config.secretAccessKey : '',
      sessionToken: 'sessionToken' in config ? config.sessionToken : '',
    });
  }

  const params = {
    FunctionName: config.functionName,
    Description: config.description,
    Handler: config.handler,
    Role: config.role,
    Timeout: config.timeout,
    MemorySize: config.memorySize,
    VpcConfig: null,
    BatchSize: null,
    Code: {},
    Runtime: '',
    Publish: false,
  };

  if (config.vpc) {
    params.VpcConfig = config.vpc;
  }

  const isPublish = (config.publish === true);

  const updateEventSource = (eventSource, updateEventSourceCallback) => {
    const eventSourceParams = extend({
      FunctionName: config.functionName,
    }, eventSource);

    lambdaNew.listEventSourceMappings({
      FunctionName: eventSourceParams.FunctionName,
      EventSourceArn: eventSourceParams.EventSourceArn,
    }, (err, data) => {
      if (err) {
        loggerImpl('List event source mapping failed, please make sure you have permission');
        updateEventSourceCallback(err);
      }

      if (data.EventSourceMappings.length === 0) {
        lambdaNew.createEventSourceMapping(eventSourceParams,
        (eventSourceError) => {
          if (eventSourceError) {
            loggerImpl('Failed to create event source mapping!');
            updateEventSourceCallback(eventSourceError);
          } else {
            updateEventSourceCallback();
          }
        });
      } else {
        async.eachSeries(data.EventSourceMappings, (mapping, iteratorCallback) => {
          lambdaNew.updateEventSourceMapping({
            UUID: mapping.UUID,
            BatchSize: params.BatchSize,
          }, iteratorCallback);
        }, (eventSourceMappingsError) => {
          if (eventSourceMappingsError) {
            loggerImpl('Update event source mapping failed');
            updateEventSourceCallback(eventSourceMappingsError);
          } else {
            updateEventSourceCallback();
          }
        });
      }
    });
  };

  const updateEventSources = (updateEventSourcesCallback) => {
    if (!config.eventSource) {
      updateEventSourcesCallback();
      return;
    }

    const eventSources = Array.isArray(config.eventSource)
      ? config.eventSource : [config.eventSource];
    async.eachSeries(
      eventSources,
      updateEventSource,
        (err) => {
          callback(err);
        },
    );
  };

  const updateFunction = (updateFunctionCallback) => {
    stat.readFile(codePackage, (err, data) => {
      if (err) {
        const returnMessage = `Error reading specified package, ${codePackage}`;
        return callback(returnMessage);
      }

      lambdaNew.updateFunctionCode({
        FunctionName: params.FunctionName, ZipFile: data, Publish: isPublish },
        (updateFunctionCodeError) => {
          if (updateFunctionCodeError) {
            let warning = 'Package upload failed. ';
            warning += 'Check your iam:PassRole permissions.';
            logger(warning);
            updateFunctionCallback(updateFunctionCodeError);
          } else {
            lambdaNew.updateFunctionConfiguration(params, (updateFunctionConfigurationError) => {
              if (updateFunctionConfigurationError) {
                const warning = 'Update function configuration failed. ';
                logger(warning);
                updateFunctionCallback(updateFunctionConfigurationError);
              } else {
                updateEventSources(updateFunctionCallback);
              }
            });
          }
        });

      return true;
    });
  };

  const createFunction = (createFunctionCallback) => {
    stat.readFile(codePackage, (createFunctionError, createFunctionData) => {
      if (createFunctionError) {
        return callback(`Error reading specified package ${codePackage}`);
      }

      params.Code = { ZipFile: createFunctionData };
      params.Runtime = 'runtime' in config ? config.runtime : 'nodejs4.3';
      params.Publish = isPublish;
      lambdaNew.createFunction(params, (err) => {
        if (err) {
          let warning = 'Create function failed. ';
          warning += 'Check your iam:PassRole permissions.';
          logger(warning);
          createFunctionCallback(err);
        } else {
          updateEventSources(callback);
        }
      });

      return true;
    });
  };

  lambdaNew.getFunction({ FunctionName: params.FunctionName }, (err) => {
    if (err) {
      if (err.statusCode === 404) {
        createFunction(callback);
      } else {
        let warning = 'AWS API request failed. ';
        warning += 'Check your AWS credentials and permissions.';
        logger(warning);
        callback(err);
      }
    } else {
      updateFunction(callback);
    }
  });
};
