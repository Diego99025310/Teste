const { URL } = require('node:url');

const DEFAULT_HOST = '127.0.0.1';

const clientMap = new WeakMap();
const activeClients = new Set();

const normalizeHeaderName = (name) => String(name || '').toLowerCase();

class AppClient {
  constructor(app) {
    this.app = app;
    this.server = null;
    this.baseUrl = null;
    this.serverPromise = null;
    activeClients.add(this);
  }

  async ensureServer() {
    if (this.server && this.baseUrl) {
      return;
    }
    if (!this.serverPromise) {
      this.serverPromise = new Promise((resolve, reject) => {
        const server = this.app.listen(0, DEFAULT_HOST, () => {
          this.server = server;
          const { port } = server.address();
          this.baseUrl = `http://${DEFAULT_HOST}:${port}`;
          resolve();
        });
        server.on('error', (error) => {
          this.serverPromise = null;
          reject(error);
        });
      });
    }
    await this.serverPromise;
  }

  async close() {
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = null;
    this.baseUrl = null;
    this.serverPromise = null;
    await new Promise((resolve) => server.close(resolve));
    activeClients.delete(this);
  }

  request(method, path) {
    const state = {
      headers: new Map(),
      body: undefined,
      hasBody: false,
      promise: null
    };

    const execute = () => {
      if (!state.promise) {
        state.promise = (async () => {
          await this.ensureServer();
          const targetUrl = new URL(path, this.baseUrl);
          const headers = {};
          for (const [key, value] of state.headers.entries()) {
            headers[key] = value;
          }
          const requestInit = {
            method,
            headers
          };
          if (state.hasBody) {
            requestInit.body = state.body;
          }
          const response = await fetch(targetUrl, requestInit);
          const text = await response.text();
          const contentType = response.headers.get('content-type') || '';
          let parsedBody = text;
          if (contentType.includes('application/json') || contentType.includes('+json')) {
            try {
              parsedBody = text ? JSON.parse(text) : {};
            } catch (error) {
              parsedBody = text;
            }
          } else {
            try {
              parsedBody = text ? JSON.parse(text) : parsedBody;
            } catch (error) {
              // keep original text
            }
          }

          return {
            status: response.status,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            body: parsedBody,
            text
          };
        })();
      }
      return state.promise;
    };

    const chain = {
      set(name, value) {
        const headerName = String(name || '');
        if (headerName) {
          state.headers.set(headerName, value);
        }
        return chain;
      },
      send(payload) {
        if (payload !== undefined) {
          if (payload instanceof Uint8Array || typeof payload === 'string') {
            state.body = payload;
          } else {
            state.body = JSON.stringify(payload);
            let hasContentType = false;
            for (const key of state.headers.keys()) {
              if (normalizeHeaderName(key) === 'content-type') {
                hasContentType = true;
                break;
              }
            }
            if (!hasContentType) {
              state.headers.set('Content-Type', 'application/json');
            }
          }
          state.hasBody = true;
        } else {
          state.body = undefined;
          state.hasBody = true;
        }
        return execute();
      },
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return execute().catch(onRejected);
      },
      finally(onFinally) {
        return execute().finally(onFinally);
      }
    };

    return chain;
  }
}

const getClient = (app) => {
  if (!clientMap.has(app)) {
    clientMap.set(app, new AppClient(app));
  }
  return clientMap.get(app);
};

const createMethod = (client, method) => (path) => client.request(method, path);

const request = (app) => {
  const client = getClient(app);
  return {
    get: createMethod(client, 'GET'),
    post: createMethod(client, 'POST'),
    put: createMethod(client, 'PUT'),
    delete: createMethod(client, 'DELETE'),
    patch: createMethod(client, 'PATCH')
  };
};

request.closeAll = async () => {
  const closures = Array.from(activeClients).map((client) => client.close());
  await Promise.allSettled(closures);
};

module.exports = request;
