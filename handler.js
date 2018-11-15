'use strict';

var mongoose = require('mongoose');
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

let cachedDb = null;

module.exports.helloWorld = (event, context, callback) => {
  console.log('Running helloWorld with event', JSON.stringify(event));
  getParameters().then(params => {
    helloWorld(params, context, callback);
  }).catch((err) => {
    console.error('Error pulling parameters', err);
    callback(err);
  });
};

function getParameters() {
  const prefix = process.env.PARAMETER_STORE_FOLDER_NAME;
  const mongoConnectionParams = [
    `MONGO_DB_URI`,
    `MONGO_DB_USER`,
    `MONGO_DB_PASSWORD`,
  ];

  return ssm.getParameters({
    Names: mongoConnectionParams.map(param => `/${prefix}/${param}`),
    WithDecryption: true,
  }).promise().then(data => {
    return data.Parameters.reduce((memo, parameter) => {
      memo[parameter.Name.split('/').pop()] = parameter.Value;
      return memo;
    }, {})
  });
}

function helloWorld(params, context, callback) {
  // the following line is critical for performance reasons to allow re-use of database connections across calls
  // to this Lambda function and avoid closing the database connection
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    if (cachedDb == null) {
      console.log('=> connecting to database', new Date());
      const username = params['MONGO_DB_USER'];
      const password = params['MONGO_DB_PASSWORD'];
      const opts = {};
      if (username || password) {
        opts.user = username;
        opts.pass = password;
      }
      mongoose.connect(params['MONGO_DB_URI'], opts, function (err, client) {
        if (err) {
          console.error('Error connecting to db', err);
          callback(err);
          return;
        }
        cachedDb = client.db;
        showCollections(cachedDb, callback);
      });
    }
    else {
      showCollections(cachedDb, callback);
    }
  }
  catch (err) {
    console.error('Error', err);
    callback(err);
  }
}

function showCollections(db, callback) {
  db.listCollections().toArray().then(collections => {
    console.log('collections', JSON.stringify(collections.map(collection => collection.name)));
    callback(null, 'SUCCESS');
  });

  //we don't need to close the connection thanks to context.callbackWaitsForEmptyEventLoop = false (above)
  //this will let our function re-use the connection (if it can re-use the same Lambda container)
};
