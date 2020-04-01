const WebSocketConnection = require('websocket').connection;

const pinger = class {
    constructor(connection, pingIntervalMs = 30000, pongTimeoutMs = 10000, startImmediate = true) {
        this.connection = connection;
        this.pingIntervalMs = pingIntervalMs;
        this.pongTimeoutMs = pongTimeoutMs;
        this.timer = null;
        this.started = false;

        this.connection.on("pong", () => {
            //console.log("Pong!");
            if (this.timer) {
                clearTimeout(this.timer);
            }
            this.timer = setTimeout(() => {
                this.ping();
            }, pingIntervalMs);
        });

        this.connection.on("close", () => this.stop());

        if (startImmediate) {
            this.start();
        }
    }

    start() {
        //console.log("Ping started");
        this.started = true;
        this.ping();
        return this;
    }

    stop() {
        //console.log("Ping stopped");
        this.started = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        return this;
    }

    ping() {
        //console.log("Ping");
        this.connection.ping();
        this.timer = setTimeout(() => {
            console.error("Pong timeout");
            this.connection.drop(WebSocketConnection.CLOSE_REASON_GOING_AWAY);
        }, this.pongTimeoutMs);
    }
};

module.exports = pinger;
