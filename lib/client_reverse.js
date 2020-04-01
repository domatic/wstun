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

let logger = require("./null_logger");

const WebSocket = require("websocket");
const WebSocketClient = WebSocket.client;
const net = require("net");
const URL = require("url").URL;
const pinger = require("./pinger");

var bindSockets = require("./bindSockets_reverse");

wst_client_reverse = function(options) {
    if (options && options.logger) {
        logger = options.logger;
    }
    this.tlsOptions = {};
    if (options.ca) {
        this.tlsOptions.ca = options.ca;
    }
    if (options.key && options.cert) {
        this.tlsOptions.key = options.key;
        this.tlsOptions.cert = options.cert;
    }
    if (!options.checkServerIdentity) {
        // By default, do not compare server identity with the common name in the certificate.
        // This will let us avoid having the server locked to a specific domain specified in the cert.
        this.tlsOptions.checkServerIdentity = (hostname, cert) => {
            return undefined;
        };
    } else if (typeof options.checkServerIdentity === "function") {
        // Let caller pass in in its own server identity check function
        this.tlsOptions.checkServerIdentity = options.checkServerIdentity;
    }
    this.portTunnel = options.portTunnel || 0;
    this.wsHostUrl = options.wsHostUrl;
    this.remoteAddr = options.remoteAddr;
    this.params = options.params || {};
};

wst_client_reverse.prototype.start = async function() {
    const reconnectTimeStart = 2;
    const reconnectTimeBackoff = 2;
    const reconnectTimeMax = 120;
    let reconnectTime = reconnectTimeStart;
    while (true) {
        try {
            [reason, description] = await this.startOnce(this.portTunnel, this.wsHostUrl, this.remoteAddr, this.params);
            logger.info(`Websocket closed [${reason}]: ${description}`);
            reconnectTime = reconnectTimeStart;
        } catch (error) {
            logger.info("[SYSTEM] --> WS connect error: " + error.toString());
            reconnectTime = Math.min(reconnectTimeBackoff * reconnectTime, reconnectTimeMax);
        }
        logger.info(`Reconnect in ${reconnectTime} seconds`);
        await new Promise(r => setTimeout(r, Math.floor(reconnectTime * 1000)));
    }
};

wst_client_reverse.prototype.startOnce = function(portTunnel, wsHostUrl, remoteAddr, params) {
    return new Promise((resolve, reject) => {
        let tlsOptions = this.tlsOptions;
        const wsClientForControll = new WebSocketClient({ tlsOptions });

        //Getting paramiters
        var urlWsHostObj = new URL(wsHostUrl);
        var _ref1 = remoteAddr.split(":"),
            remoteHost = _ref1[0],
            remotePort = _ref1[1];

        Object.entries(params || {}).forEach(([k, v]) => {
            urlWsHostObj.searchParams.append(k, v);
        });
        urlWsHostObj.searchParams.append("dst", urlWsHostObj.hostname + ":" + portTunnel);

        logger.info("[SYSTEM] - Connecting to", wsHostUrl);
        logger.info("[SYSTEM] --> exposing", remoteAddr, "on port", portTunnel);

        wsClientForControll.on("connect", wsConnectionForControll => {
            logger.info("[SYSTEM] --> TCP connection established!");

            wsConnectionForControll.on("close", (reason, description) => {
                resolve([reason, description]);
            });

            wsConnectionForControll.on("message", message => {
                //Only utf8 message used in Controll WS Socket
                var parsing = message.utf8Data.split(":");

                //Managing new TCP connection on WS Server
                if (parsing[0] === "NC") {
                    //Identification of ID connection
                    var idConnection = parsing[1];

                    const wsClientData = new WebSocketClient({ tlsOptions });

                    wsClientData.on("connectFailed", e => {
                        logger.error("Error ", e);
                    });
                    //Management of new WS Client for every TCP connection on WS Server
                    wsClientData.on("connect", wsConnectionForData => {
                        //Waiting of WS Socket with WS Server
                        wsConnectionForData.socket.pause();

                        //DEBUG logger.info("Connected wsClientData to WS-Server for id "+parsing[1]+" on localport::"+wsConnectionForData.socket.localPort);
                        logger.info("[SYSTEM] --> Start TCP connection on client to " + remoteHost + ":" + remotePort);

                        tcpConnection(wsConnectionForData, remoteHost, remotePort);

                        new pinger(wsConnectionForData);
                    });

                    wsClientData.connect(wsHostUrl + "/?id=" + idConnection, "tunnel-protocol");
                }
            });

            new pinger(wsConnectionForControll);
        });

        //Management of WS Connection failed
        wsClientForControll.on("connectFailed", function(error) {
            reject(error);
        });

        //Connection to Controll WS Server
        wsClientForControll.connect(urlWsHostObj.toString(), "tunnel-protocol");
    });
};

function tcpConnection(wsConn, host, port) {
    var tcpConn = net.connect({ port: port, host: host }, function() {});
    bindSockets(wsConn, tcpConn);

    tcpConn.on("connect", function() {
        //Resume of the WS Socket after the connection to WS Server
        wsConn.socket.resume();
    });

    tcpConn.on("error", request => {
        logger.info("[SYSTEM] --> " + request);
    });
}

module.exports = wst_client_reverse;
