//###############################################################################
//##
//# Copyright (C) 2014-2015 Andrea Rocco Lotronto, 2017 Nicola Peditto,
//#               2020 Andrew Walters
//##
//# Licensed under the Apache License, Version 2.0 (the "License");
//# you may not use this file except in compliance with the License.
//# You may obtain a copy of the License at
//##
//# http://www.apache.org/licenses/LICENSE-2.0
//##
//# Unless required by applicable law or agreed to in writing, software
//# distributed under the License is distributed on an "AS IS" BASIS,
//# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//# See the License for the specific language governing permissions and
//# limitations under the License.
//##
//###############################################################################

let logger = require('./null_logger');
var WebSocketServer, bindSockets, http, net, url, wst_server_reverse;

const pinger = require('./pinger');
WebSocketServer = require('websocket').server;
http = require('http');
url = require("url");
net = require("net");
bindSockets = require("./bindSockets_reverse");

uuid = require('uuid');

https_flag = false;

const util = require('util');
const { EventEmitter } = require('events');
var newWSTCP_DATA = new EventEmitter();
newWSTCP_DATA.setMaxListeners(1000);

wst_server_reverse = function(options) {
  EventEmitter.call(this);
  if(options !== undefined) {
    if (options.logger) {
      logger = options.logger;
    }
    this.dynamicPortOnly = options.dynamicPortOnly;
    https_flag = (options.ssl || '').toString() === 'true';
  }
  logger.info("[SYSTEM] - WS Reverse Tunnel Server starting...");


  if(https_flag){
    
    //HTTPS
    logger.info("[SYSTEM] - WS Reverse Tunnel Server over HTTPS.");
    var https = require('https');

    //require("../lib/https_override"); //add parameters overriding each https request
    
    https_flag = options.ssl;

    var credentials = {
      key: options.key,
      cert: options.cert
    };
    if (options.ca) {
      credentials.ca = options.ca;
    }
    if (options.verifyClient) {
      credentials.requestCert = true;
    }

    this.httpServer = https.createServer(credentials, function(request, response) {
      //logger.info(request, response);
      //response.writeHead(404);
      //return response.end();
      response.writeHead(200, {"Content-Type": "text/html"});
      response.write("<!DOCTYPE 'html'>");
      response.write("<html>");
      response.write("<head>");
      response.write("<title>WSTUN</title>");
      response.write("</head>");
      response.write("<body>");
      response.write("iotronic-wstun is running!");
      response.write("</body>");
      response.write("</html>");
      response.end();
    });
    

  }else{
    
    //HTTP
    logger.info("[SYSTEM] - WS Reverse Tunnel Server over HTTP.");
    this.httpServer = http.createServer(function(request, response) {
      //logger.info(request, response);
      //response.writeHead(404);
      //return response.end();
      response.writeHead(200, {"Content-Type": "text/html"});
      response.write("<!DOCTYPE 'html'>");
      response.write("<html>");
      response.write("<head>");
      response.write("<title>WSTUN</title>");
      response.write("</head>");
      response.write("<body>");
      response.write("iotronic-wstun is running!");
      response.write("</body>");
      response.write("</html>");
      response.end();

    });
    
  }

  //create websocket
  this.wsServerForControll = new WebSocketServer({
    httpServer: this.httpServer,
    autoAcceptConnections: false
  });

};

wst_server_reverse.prototype.start = function(port, hostIfc) {

  if (https_flag)
    logger.info("[SYSTEM] - WS Reverse Tunnel Server starting on: wss://localhost:" + port);// + " - CERT: \n" + this.s4t_cert);
  else
    logger.info("[SYSTEM] - WS Reverse Tunnel Server starting on: ws://localhost:" + port);

  //Activate HTTP/S server
  this.httpServer.listen(port, function() {
    logger.info("[SYSTEM] - WS Reverse Tunnel Server is listening...");
  });


  this.wsServerForControll.on('request', (function(_this){
    return function(request){

      //Create one TCP server for each client WebSocketRequest
      request.tcpServer = new net.createServer();

      var uri = url.parse(request.httpRequest.url, true);

      var src_address = request.httpRequest.client._peername.address.split(":")[3];

      if (uri.query.dst != undefined){

        var remoteAddr = uri.query.dst;
        ref1 = remoteAddr.split(":");
        // Listening on "port 0" will cause the OS to allocate an unused port
        var portTcp = (!this.dynamicPortOnly && ref1[1]) || 0;
          
        logger.info("[SYSTEM] WebSocket creation towards " + src_address + " on port " + portTcp );

        let id = uuid.v4();
        request.portTcp = portTcp;
        request.tcpServer.listen(portTcp, hostIfc, () => {
          // Get real port if we auto-selected
          if (request.portTcp == 0) {
            request.portTcp = request.tcpServer.address().port;
          }
          logger.info(
            "[SYSTEM] --> TCP server is listening on port " + request.portTcp
          );

          request.wsConnectionForControll = request.accept(
            "tunnel-protocol",
            request.origin
          );
          logger.info("[SYSTEM] --> WS connection created");

          request.wsConnectionForControll.on("close", function(
            reasonCode,
            description
          ) {
            logger.info(
              "[SYSTEM] - WebSocket Controll Peer " +
                request.wsConnectionForControll.remoteAddress +
                " disconnected - Reason: [" +
                reasonCode +
                "] " +
                description
            );
            logger.info("[SYSTEM] --> Close websocket server on port " + portTcp);
            _this.emit("disconnect", { id: id, port: request.portTcp });
            request.tcpServer.close();
          });

          request.pinger = new pinger(request.wsConnectionForControll);

          // Fire off event for tracking of ports to connections
          _this.emit("connect", {
            id: id,
            remote: remoteAddr,
            port: request.portTcp,
            query: uri.query,
            cert: request.socket.getPeerCertificate && request.socket.getPeerCertificate()
          }, () => request.wsConnectionForControll.close());
        });
      }
      else{
        //REQUEST FOR WS USED FOR DATA
        logger.info("[SYSTEM] --> WebSocket Request for Data");
        newWSTCP_DATA.emit('created', request);

      }

      //Manage TCP error events
      request.tcpServer.on('error', function(message) {
        if(message.code == "EADDRINUSE"){
          logger.info("[SYSTEM] - Error - Port " + message.port + " already used: connection aborted.");
        }else{
          logger.info("[SYSTEM] - Error establishing TCP connection: " + message);
        }
        if (request) {
          if (request.wsConnectionForControll) {
            request.wsConnectionForControll.close();
          } else if (message.code == "EADDRINUSE") {
            request.reject(400, "Port in use");
          } else {
            request.reject(500);
          }
        }
      });

      //Manage TCP Connection event
      request.tcpServer.on('connection', (function(_this){
        
        return function(tcpConn){

          tcpConn.wsConnection;
          
          //Putting in pause the tcp connection waiting the new socket WS Socket for data
          tcpConn.pause();
          var idConnection = uuid.v4();
          var msgForNewConnection = "NC:"+idConnection;
          
          request.wsConnectionForControll.sendUTF(msgForNewConnection);
          
          var EventManager = (function(_this){

            return function(request){

              try{

                var uri = url.parse(request.httpRequest.url, true);
                
                if(idConnection == uri.query.id){

                  //tcpConn.wsConnection = wsTCP;
                  tcpConn.wsConnection = request.accept('tunnel-protocol', request.origin);
                  bindSockets(tcpConn.wsConnection, tcpConn);
                  tcpConn.pinger = new pinger(tcpConn.wsConnection);
                  //DEBUG logger.info("Bind ws tcp");

                  //Resuming of the tcp connection after WS Socket is just created
                  tcpConn.resume();
                  //DEBUG logger.info("TCP RESUME");
                  newWSTCP_DATA.removeListener('created', EventManager);
                }

              }catch (err) {
                // handle the error
                logger.info("[SYSTEM] --> ERROR: " + err);
                request.tcpServer.close();
                newWSTCP_DATA.removeListener('created', EventManager);
              }
              
            }

          })(this)
  
          newWSTCP_DATA.on('created', EventManager);

        }
        
      })(_this));

    }
  })(this));
};

util.inherits(wst_server_reverse, EventEmitter);

module.exports = wst_server_reverse;
