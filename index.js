#!/usr/bin/env node
/// <reference path="typings/node/node.d.ts" />

var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

require('lru-cache-cluster');

cluster.setupMaster({
  exec: 'decryptor.js'
});

for (var i = 0; i < numCPUs; i++) {
  cluster.fork();
}

cluster.on('exit', function(worker, code, signal) {
  console.log('[cluster] worker ' + worker.process.pid + ' died');
});
