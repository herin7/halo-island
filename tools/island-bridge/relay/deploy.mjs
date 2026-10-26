#!/usr/bin/env node
/**
 * Deploys the Halo relay to your AWS account with the AWS CLI (run `aws login` first):
 * a private S3 bucket and a DynamoDB table that both forget everything after a day, a role that can
 * touch only those two, and a Lambda behind an HTTPS function URL. Saves the URL and a fresh relay
 * key to ~/.halo/bridge.json, where the bridge and the pairing QR pick them up.
 *
 *   node tools/island-bridge/relay/deploy.mjs [region]     # default ap-south-1 (Mumbai)
 *   node tools/island-bridge/relay/deploy.mjs --update     # new handler code, same everything else
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const CONFIG = join(homedir(), '.halo', 'bridge.json');
const config = (() => { try { return JSON.parse(readFileSync(CONFIG, 'utf8')); } catch { return {}; } })();
const update = process.argv.includes('--update');
const region = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? config.relay?.region ?? 'ap-south-1';
const aws = (...args) => execFileSync('aws', [...args, '--region', region, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const json = (...args) => JSON.parse(aws(...args) || '{}');
const quiet = (...args) => { try { return aws(...args); } catch { return ''; } };

/** A one-file zip (stored, not deflated): all Lambda needs, without a zip tool on Windows. */
function zipOne(name, data) {
  const n = Buffer.from(name), crc = crc32(data), size = data.length;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + size, 16);
  return Buffer.concat([local, n, data, central, n, end]);
}

const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'handler.mjs'));
const zip = join(tmpdir(), `halo-relay-${Date.now()}.zip`);
writeFileSync(zip, zipOne('handler.mjs', code));

if (update) {
  if (!config.relay?.name) throw new Error('No relay deployed yet: run without --update first.');
  aws('lambda', 'update-function-code', '--function-name', config.relay.name, '--zip-file', `fileb://${zip}`);
  console.log(`Updated ${config.relay.name}.`);
  process.exit(0);
}

const account = json('sts', 'get-caller-identity').Account;
const name = config.relay?.name ?? `halo-relay-${randomBytes(4).toString('hex')}`;
const bucket = `${name}-${account}`;
const key = config.relay?.key ?? randomBytes(24).toString('base64url');
// Saved before anything exists, so a rerun after a failure reuses these names instead of leaking resources.
mkdirSync(join(homedir(), '.halo'), { recursive: true });
writeFileSync(CONFIG, JSON.stringify({ ...config, relay: { ...config.relay, name, region, key } }, null, 2));
console.log(`Deploying ${name} to ${region}…`);

// Mailbox table: free-tier capacity, items expire after a day.
quiet('dynamodb', 'create-table', '--table-name', name,
  '--attribute-definitions', 'AttributeName=pk,AttributeType=S', 'AttributeName=sk,AttributeType=S',
  '--key-schema', 'AttributeName=pk,KeyType=HASH', 'AttributeName=sk,KeyType=RANGE',
  '--provisioned-throughput', 'ReadCapacityUnits=5,WriteCapacityUnits=5', '--sse-specification', 'Enabled=true');
aws('dynamodb', 'wait', 'table-exists', '--table-name', name);
quiet('dynamodb', 'update-time-to-live', '--table-name', name, '--time-to-live-specification', 'Enabled=true,AttributeName=ttl');

// File drops: private, encrypted at rest, gone after a day.
quiet('s3api', 'create-bucket', '--bucket', bucket, ...(region === 'us-east-1' ? [] : ['--create-bucket-configuration', `LocationConstraint=${region}`]));
aws('s3api', 'put-public-access-block', '--bucket', bucket, '--public-access-block-configuration', 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true');
aws('s3api', 'put-bucket-lifecycle-configuration', '--bucket', bucket, '--lifecycle-configuration', JSON.stringify({ Rules: [{ ID: 'forget', Status: 'Enabled', Filter: { Prefix: '' }, Expiration: { Days: 1 } }] }));

// A role that can touch this table and bucket, and write (short-lived) logs. Nothing else.
const trust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] });
const role = (() => { try { return json('iam', 'get-role', '--role-name', name).Role.Arn; } catch { return json('iam', 'create-role', '--role-name', name, '--assume-role-policy-document', trust).Role.Arn; } })();
aws('iam', 'put-role-policy', '--role-name', name, '--policy-name', 'mailbox', '--policy-document', JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    { Effect: 'Allow', Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query'], Resource: `arn:aws:dynamodb:${region}:${account}:table/${name}` },
    { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: `arn:aws:s3:::${bucket}/*` },
    { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${region}:${account}:*` },
  ],
}));

// IAM roles take a few seconds before Lambda can assume them.
let created = false;
for (let i = 0; i < 12 && !created; i++) {
  try {
    aws('lambda', 'create-function', '--function-name', name, '--runtime', 'nodejs20.x', '--handler', 'handler.handler', '--role', role,
      '--zip-file', `fileb://${zip}`, '--memory-size', '128', '--timeout', '10', '--architectures', 'arm64',
      '--environment', JSON.stringify({ Variables: { TABLE: name, BUCKET: bucket, RELAY_KEY: key } }));
    created = true;
  } catch (e) {
    if (/already exist/i.test(String(e.stderr))) { created = true; aws('lambda', 'update-function-configuration', '--function-name', name, '--environment', JSON.stringify({ Variables: { TABLE: name, BUCKET: bucket, RELAY_KEY: key } })); }
    else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
}
if (!created) throw new Error('Lambda creation kept failing; check IAM permissions.');
aws('lambda', 'wait', 'function-active-v2', '--function-name', name);
quiet('logs', 'create-log-group', '--log-group-name', `/aws/lambda/${name}`);
quiet('logs', 'put-retention-policy', '--log-group-name', `/aws/lambda/${name}`, '--retention-in-days', '1');

const url = (() => {
  try { return json('lambda', 'get-function-url-config', '--function-name', name).FunctionUrl; }
  catch { return json('lambda', 'create-function-url-config', '--function-name', name, '--auth-type', 'NONE').FunctionUrl; }
})();
// The function URL is public at the HTTP level; the relay key (and E2E sealing) is the lock.
quiet('lambda', 'add-permission', '--function-name', name, '--statement-id', 'url', '--action', 'lambda:InvokeFunctionUrl', '--principal', '*', '--function-url-auth-type', 'NONE');
quiet('lambda', 'add-permission', '--function-name', name, '--statement-id', 'invoke', '--action', 'lambda:InvokeFunction', '--principal', '*');

mkdirSync(join(homedir(), '.halo'), { recursive: true });
writeFileSync(CONFIG, JSON.stringify({ ...config, relay: { name, region, url: url.replace(/\/$/, ''), key } }, null, 2));
console.log(`\n  Relay ready: ${url}\n  Saved to ${CONFIG}. Restart the bridge, then pair again (open /pair) so the phone learns it.\n`);
