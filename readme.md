# WSTUN - Reverse Tunnels over WebSocket for Node.js

Adapted and expanded from MDSlab/wstun.

**NOTE**: Only reverse tunneling (server_reverse and client_reverse) have been updated with
new features. Regular client and server are largely unchanged and could be broken.

## Changes from MDSlab/wstun

- SSL mode validates certificates (i.e. rejectUnauthorized not set)
- Can bind tunneled port to specific interface (e.g. localhost only)
- Implemented 2-way SSL/TLS option
- Can allow/force dynamic port allocation on reverse server
- Make reverse server an event emitter so app can know when a connection is made
- Can pass in parameters from client that get attached to server connection event
- Add reconnect logic in reverse client
- Allow passing in logger instead of fixed dependency on log4js
- Remove fixed logging path of /var/...
- Add ping-pong to websocket connections to keep alive

## Command-line usage

```
Options:
  -2                       Enable client verification (2-way SSL/TLS)
  -s, --server             run as server, specify listening port
  -t, --tunnel             run as tunnel client, specify localport:host:port
  -p, --params             append key-values to reverse-client request
  -r, --reverse            run in reverse tunneling mode
  --ssl                    "true" | "false" to enable|disable HTTPS communication.
  --key                    [only with --ssl="true"] path to private key certificate.
  --cert                   [only with --ssl="true"] path to public key certificate.
  --ca                     [only with --ssl="true"] path to CA certificate.
  --check-server-identity  Check that server host name matches common name in cert
  ```

## Reverse server usage

```
    const listenPort = 9090;
    // Allow tunneled connections only from localhost, e.g.
    // don't expose tunneled ports to outside network
    const tunnelInterface = '127.0.0.1';
    let options = {
        // Optional logging interface that implements info, warn, error functions.
        // If not specified, no logging is done.
        logger: console,
        // If true, do not allow clients to specify port to tunnel
        dynamicPortOnly: false,
        // If true, request client certificate, enabling 2-way TLS
        verifyClient: true,
        // If true, enable SSL/TLS
        ssl: true,
        // Server key and certificate used for TLS
        key: fs.readFileSync('server-key.pem', 'utf8'),
        cert: fs.readFileSync('server-crt.pem', 'utf8'),
        // Certificate authority cert used to validate client certs for 2-way TLS
        ca: fs.readFileSync('ca-crt.pem', 'utf8')
    };
    // Create server
    let server = new wst.server_reverse(options);
    // Connect event
    server.on('connect', params => {
        let info = {
            // A uuid that is always included
            id: params.id,
            // Port that is being tunneled, either specified by client or assigned dynamically
            port: params.port,
            // Optional parameters passed as HTTP GET parameters in client request
            name: params.query.name || 'Unknown'
        };
        console.log('Connected:', info);
        // Additional setup here...
        // (e.g. set up proxy to route traffic to tunneled port)
    });
    server.on('disconnect', info => {
        // The same id and port that were provided in connect event are passed in here.
        // Additional optional parameters from connect event aren't included.
        console.log('Connected:', info);
        // Additional cleanup here...
        // (e.g. remove proxy routes)
    });
    // Start server
    server.start(listenPort, tunnelInterface);
```

## Reverse client usage

```
    let options = {
        // Optional logging interface that implements info, warn, error functions.
        // If not specified, no logging is done.
        logger: console,
        // Client key and certificate filenames used for 2-way TLS/SSL
        key: fs.readFileSync('server-key.pem', 'utf8'),
        cert: fs.readFileSync('server-crt.pem', 'utf8'),
        // Certificate authority cert used to validate server certificate
        ca: fs.readFileSync('ca-crt.pem', 'utf8'),
        // Whether to check identity of server certificate. In all cases, the server certificate
        // will be validated by the CA cert, so we know we have _a_ valid certificate, but without
        // checking identity, we will not have verified _which_ certificate we have (e.g. if the same
        // CA is used for both client and server certs, it could be another client we connected to).
        // Possible values (default is false)
        //  false - Do not do any additional server identity checks, any valid signed cert is accepted
        //  true - Use default checks that are usually used by HTTPS. This involves checking the subject
        //    alternate name(s) on the cert, or if not present, the common name, and compares it to the
        //    host domain name. Note that this means a cert would be locked to a domain, which might not
        //    be desireable.
        //  function (hostname, cert) - Custom validation function receives hostname and certificate.
        //    If identity is ok, function should return undefined, else it should return an Error object.
        checkServerIdentity: false,
        // Endpoint of reverse server to connect to ('wss' will enable TLS, 'ws' will use insecure websocket)
        wsHostUrl: 'wss://server.example.com:9090/',
        // Address to tunnel to, from the perspective of the client machine. Usually the client will just
        // want to tunnel back to itself, in which case the remote address would be 127.0.0.1.
        remoteAddr: '127.0.0.1',
        // Port on client to tunnel to, typically something like a webserver on the client machine
        // would be listening on this port.
        portTunnel: 4000
    });
    client = new wst.client_reverse(options);
    // Note that this will try to reconnect indefinitely (there currently is no corresponding stop() function)
    client.start();
```
