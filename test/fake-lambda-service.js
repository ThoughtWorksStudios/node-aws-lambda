var extend = require('util')._extend;
var uuid = require('node-uuid');


module.exports = function() {
  var functions = {};
  var mappings = {};

  function getFun(name) {
    return functions[name];
  }

  function writeFun(name, config, code) {
    functions[name] = {
      'config': config,
      'code': code,
      'eventSources': {}
    };
  }

  function findMappingByUUID(uuid) {
    return mappings[uuid];
  }

  function notFoundError() {
    return {statusCode: 404};
  }

  function validateParams(params, mandatoryFields, optionalFields, apiName) {
    var allFields = mandatoryFields.concat(optionalFields);
    var mandis = mandatoryFields.slice();
    Object.keys(params).forEach(function(key) {
      if(allFields.indexOf(key) === -1) {
        throw "Param key '" + key +  "' is not allowed for the given API " + apiName;
      }

      var mandiIndex = mandis.indexOf(key);
      if(mandiIndex >= 0) {
        mandis.splice(mandiIndex, 1);
      }
    });

    if(mandis.length > 0) {
      throw "Param keys: " + mandis.join(",") + " are missing for the given API " + apiName;
    }
  }

  return {
    // http://docs.aws.amazon.com/lambda/latest/dg/API_CreateFunction.html
    createFunction: function(params, callback) {
      validateParams(params,
                     ['FunctionName', 'Code', 'Handler', 'Role', 'Runtime'],
                     ['Description', 'MemorySize', 'Timeout', 'Publish', 'VpcConfig', 'Environment'], 'createFunction')

      var name = params.FunctionName;
      var code = params.Code;
      var config = extend({}, params);
      delete config.Code;

      if(getFun(name)) {
        callback({
          statusCode: 401,
          message: "Function already created"
        })
      } else {
        writeFun(name, config, code);
        callback();
      }
    },

    // http://docs.aws.amazon.com/lambda/latest/dg/API_GetFunction.html
    getFunction: function(params, callback) {
      validateParams(params, ['FunctionName'], [], 'getFunction');

      var fun = getFun(params.FunctionName);
      if (!fun) {
        callback(notFoundError());
        return;
      }
      callback(null, {
        Code: {
          'Location': 'fake',
          'Repository': 'fake',
          'Content': fun.code.ZipFile
        },
        Configuration: fun.config
      });
    },

    eventSourceMappingCount: function(funName) {
      var fun = getFun(funName);

      return Object.keys(fun.eventSources).reduce(function(memo, current) {
        return memo + fun.eventSources[current].length;
      }, 0);
    },

    // http://docs.aws.amazon.com/lambda/latest/dg/API_ListEventSourceMappings.html
    listEventSourceMappings: function(params, callback) {
      validateParams(params,
                     ['FunctionName', 'EventSourceArn'],
                     ['Marker', 'MaxItems'], 'listEventSourceMappings');

      var name = params.FunctionName;
      var sourceArn = params.EventSourceArn;

      var fun = getFun(name);
      if(fun) {
        callback(null, {
          EventSourceMappings: fun.eventSources[sourceArn] || []
        });
      } else {
        callback(notFoundError());
      }
    },

    // http://docs.aws.amazon.com/lambda/latest/dg/API_CreateEventSourceMapping.html
    createEventSourceMapping: function(params, callback) {
      validateParams(params,
                     ['FunctionName', 'EventSourceArn'],
                     ['Enabled', 'BatchSize', 'StartingPosition'], 'createEventSourceMapping');
      var fun = getFun(params.FunctionName);
      if(!fun) {
        callback(notFoundError());
        return;
      }

      var sourceArn = params.EventSourceArn;
      fun.eventSources[sourceArn] = fun.eventSources[sourceArn] || [];
      var newMapping = extend({UUID: uuid.v4()}, params);
      fun.eventSources[sourceArn].push(newMapping);
      mappings[newMapping.UUID] = newMapping;
      callback(null, newMapping);
    },

    // http://docs.aws.amazon.com/lambda/latest/dg/API_UpdateFunctionCode.html
    updateFunctionCode: function(params, callback) {
      validateParams(params,
                     ['FunctionName'],
                     ['Publish', 'ZipFile'], 'updateFunctionCode');

      var fun = getFun(params.FunctionName);
      if(!fun) {
        callback(notFoundError());
        return;
      }

      fun.config.Publish = params.Publish;
      fun.code.ZipFile = params.ZipFile;
      callback();
    },

    // http://docs.aws.amazon.com/lambda/latest/dg/API_UpdateFunctionConfiguration.html
    updateFunctionConfiguration: function(params, callback) {
      validateParams(params,
                     ['FunctionName'],
                     ['Description', 'Handler', 'MemorySize', 'Role', 'Timeout', 'VpcConfig', 'Environment'],
                     'updateFunctionConfiguration')

      var fun = getFun(params.FunctionName);
      if(!fun) {
        callback(notFoundError());
        return;
      }

      Object.keys(params).forEach(function(key) {
        fun.config[key] = params[key];
      });

      callback();
    },

    updateEventSourceMapping: function(params, callback) {
      validateParams(params,
                     ['UUID'],
                     ['BatchSize', 'Enabled', 'FunctionName'], 'updateEventSourceMapping');

      var mapping = findMappingByUUID(params.UUID);
      if(!mapping) {
        callback(notFoundError());
        return;
      }

      Object.keys(params).forEach(function(key) {
        mapping[key] = params[key];
      });


      callback();

    },
  };
}
