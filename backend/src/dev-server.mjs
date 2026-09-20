import http from 'node:http';
import { handler } from './handler.mjs';

process.env.NODE_ENV ||= 'development';
process.env.STORAGE ||= 'memory';
process.env.ALLOWED_ORIGINS ||= `http://localhost:${process.env.FRONTEND_PORT || 5173}`;

const port = Number(process.env.API_PORT || 8787);
const server = http.createServer(async (request, response) => {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size <= 70_000) chunks.push(chunk);
  });
  request.on('end', async () => {
    const result = await handler({
      httpMethod: request.method,
      path: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8'),
      requestContext: { http: { method: request.method, path: request.url, sourceIp: request.socket.remoteAddress } },
    });
    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`CryptPaste API listening on http://127.0.0.1:${port}`));
