/**
 * Halo relay: a blind mailbox between your PC bridge and your phone, for when they aren't on the
 * same Wi-Fi. It stores opaque blobs only: everything is sealed end to end (AES-256-GCM) with a key
 * that never leaves your two devices, so this function, its logs and AWS see noise.
 *
 * Routes (all need `x-relay-key`; `{ch}` is a 32-hex channel derived from your pairing secret):
 *   POST /{ch}/state           sealed desk state (from the PC)        → { ver }
 *   GET  /{ch}/state?since=N   latest state, or 304 if still version N
 *   POST /{ch}/in              one sealed command (from the phone)
 *   GET  /{ch}/in              pending commands, oldest first           → [{ k, v }]
 *   DELETE /{ch}/in/{k}        done with a command
 *   PUT  /{ch}/f/{id}          a sealed file (≤ 4 MB)
 *   GET  /{ch}/f/{id}          that file
 * Items expire after a day (DynamoDB TTL, S3 lifecycle).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const { TABLE, BUCKET, RELAY_KEY } = process.env;
const DAY = 86_400;

const reply = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { 'cache-control': 'no-store', ...headers },
  body: body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body),
});

function authorized(headers) {
  const given = Buffer.from(String(headers['x-relay-key'] ?? ''));
  const want = Buffer.from(RELAY_KEY ?? '');
  return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
}

const bodyOf = (event) => (event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64') : Buffer.from(event.body ?? '', 'utf8'));

export async function handler(event) {
  // Anything that isn't ours gets the same bland 404 as a wrong path: nothing to learn here.
  if (!authorized(event.headers ?? {})) return reply(404, 'not found');
  const method = event.requestContext?.http?.method ?? 'GET';
  const [ch, kind, key] = (event.rawPath ?? '/').split('/').filter(Boolean);
  if (!/^[0-9a-f]{32}$/.test(ch ?? '')) return reply(404, 'not found');
  const ttl = Math.floor(Date.now() / 1000) + DAY;

  try {
    if (kind === 'state' && method === 'POST') {
      const ver = Date.now();
      await db.send(new PutCommand({ TableName: TABLE, Item: { pk: ch, sk: 'state', v: bodyOf(event).toString('utf8'), ver, ttl } }));
      return reply(200, { ver });
    }
    if (kind === 'state' && method === 'GET') {
      const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: ch, sk: 'state' } }));
      if (!Item) return reply(204, null);
      if (String(Item.ver) === String(event.queryStringParameters?.since ?? '')) return reply(304, null);
      return reply(200, { ver: Item.ver, v: Item.v });
    }
    if (kind === 'in' && method === 'POST') {
      const k = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
      await db.send(new PutCommand({ TableName: TABLE, Item: { pk: ch, sk: `in#${k}`, v: bodyOf(event).toString('utf8'), ttl } }));
      return reply(200, { k });
    }
    if (kind === 'in' && method === 'GET') {
      const { Items = [] } = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :p and begins_with(sk, :s)', ExpressionAttributeValues: { ':p': ch, ':s': 'in#' }, Limit: 20 }));
      return reply(200, Items.map((i) => ({ k: i.sk.slice(3), v: i.v })));
    }
    if (kind === 'in' && method === 'DELETE' && key) {
      await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: ch, sk: `in#${key}` } }));
      return reply(200, { ok: true });
    }
    if (kind === 'f' && key && /^[\w-]{6,64}$/.test(key)) {
      if (method === 'PUT') {
        const data = bodyOf(event);
        if (data.length > 4.5 * 1024 * 1024) return reply(413, 'too large');
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${ch}/${key}`, Body: data }));
        return reply(200, { ok: true });
      }
      if (method === 'GET') {
        const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${ch}/${key}` })).catch(() => null);
        if (!obj) return reply(404, 'not found');
        const bytes = Buffer.from(await obj.Body.transformToByteArray());
        return { statusCode: 200, headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }, body: bytes.toString('base64'), isBase64Encoded: true };
      }
    }
    return reply(404, 'not found');
  } catch (e) {
    console.error(e?.name ?? 'error'); // never the body: logs see as little as possible
    return reply(500, 'error');
  }
}
