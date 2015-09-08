#!/usr/bin/env node

var request = require('request')
var url = require('url')
var crypto = require('crypto')
var root = require('root')
var cors = require('cors')
var minimist = require('minimist')

var LRU = require("lru-cache-cluster")
var cluster = require("cluster")

var argv = minimist(process.argv, {
  alias: {p:'port', q:'quiet', v:'version', r:'redirect'},
  booleans: ['quiet']
})

var cache = LRU({max: 100})

var app = root()

app.all('*', cors());

request = request.defaults({timeout:15000, agent:false, jar: request.jar()})

var redirect = argv.redirect;
var quiet = argv.quiet;

var respond = function(proxy, res, body) {
  delete proxy.headers['content-length']
  delete proxy.headers['transfer-encoding']
  delete proxy.headers['content-md5']
  delete proxy.headers['connection']

  proxy.headers['content-length'] = body.length

  res.writeHead(proxy.statusCode, proxy.headers)
  res.end(body)
}

var requestRetry = function(u, opts, cb) {
  var tries = 10
  var action = function() {
    request(u, opts, function(err, res) {
      if (err) {
        if (tries-- > 0) return setTimeout(action, 1000)
        return cb(err)
      }
      cb(err, res)
    })
  }

  action()
}

var encIV = function(seq) {
  var buf = new Buffer(16)
  buf.fill(0)
  buf.writeUInt32BE(seq, 12)
  return buf.toString('hex')
}

var log = function(msg) {
  if (!quiet) console.log(msg)
}

app.get('/crossdomain.xml', function (req, res) {
	res.setHeader('Content-Type', 'text/xml');
	res.send("<?xml version=\"1.0\"?>\n" +
'<!DOCTYPE cross-domain-policy SYSTEM "http://www.adobe.com/xml/dtds/cross-domain-policy.dtd">' + "\n" +
"<cross-domain-policy>\n" +
'<allow-access-from domain="*" />' + "\n" +
"</cross-domain-policy>\n");
});

app.get('/', function(req, res) {
  delete req.headers.host

  var playlist = req.query['url']

  log('m3u8 : '+playlist)

  var req = function () {
    requestRetry(playlist, function(err, response) {
      if (err) return res.error(err)

      var body = response.body.trim().split('\n')
      var key
      var iv
      var seq = 0

      body = body
        .map(function(line) {
          if (line.indexOf('#EXT-X-MEDIA-SEQUENCE') === 0) {
            seq = parseInt(line.split(':').pop(), 10)
            return line
          }

          if (line.indexOf('#EXT-X-KEY:METHOD=AES-128') === 0) {
            var parsed = line.match(/URI="([^"]+)"(?:,IV=(.+))?$/)
            key = parsed[1]
            if (parsed[2]) iv = parsed[2].slice(2).toLowerCase()
            return null
          }

          if (line[0] === '#') return line

		  var ts_url = url.resolve(playlist, line.trim())
		  var key_url = url.resolve(playlist, key) || ''

          return '/ts?url='+encodeURIComponent(ts_url)+'&key='+encodeURIComponent(key)+'&iv='+encodeURIComponent(iv || encIV(seq++))
        })
        .filter(function(line) {
          return line
        })
        .join('\n')+'\n'

      respond(response, res, new Buffer(body))
    })
  }

  if (!redirect) return req()

  requestRetry(playlist, function(err, res) {
    if (err) return res.error(err)
    if (redirect) playlist = url.resolve(playlist, redirect)
    redirect = false
    req()
  })
})

app.get('/index.m3u8', '/')

var getKey = function(url, headers, cb) {
  cache.get(url, function (key) {
    if (key) {
      key = new Buffer(key, 'binary');
      return cb(null, key);
    }    
    
    log('key  : '+url)
    requestRetry(url, {headers:headers, encoding:null}, function(err, response) {
      if (err) return cb(err)
      cache.set(url, response.body.toString('binary'))
      cb(null, response.body)
    })
  });
}

app.get('/ts', function(req, res) {
  delete req.headers.host

  var u = req.query.url
  log('ts   : '+u)

  requestRetry(u, { encoding:null}, function(err, response) {
    if (err) return res.error(err)
    if (!req.query.key) return respond(response, res, response.body)

    var ku = req.query.key
    getKey(ku, req.headers, function(err, key) {
      if (err) return res.error(err)

      var iv = new Buffer(req.query.iv, 'hex')
      log('iv   : 0x'+req.query.iv)

      var dc = crypto.createDecipheriv('aes-128-cbc', key, iv)
      var buffer = Buffer.concat([dc.update(response.body), dc.final()])

      respond(response, res, buffer)
    })
  })
})

app.listen(argv.port || 9999, function(addr) {
  console.log('Listening on http://'+addr+'/index.m3u8')
})