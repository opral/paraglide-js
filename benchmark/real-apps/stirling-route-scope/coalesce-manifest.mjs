import fs from 'node:fs';
import { createHash } from 'node:crypto';
const [input, output, bucketArg] = process.argv.slice(2);
const bucketCount = Number(bucketArg);
if (!Number.isSafeInteger(bucketCount) || bucketCount < 1) throw new Error('bucketCount must be a positive integer');
const manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
const initial = manifest.groups.find((group) => group.key === 'initial');
const lazy = manifest.groups.filter((group) => group.key !== 'initial');
const buckets = Array.from({ length: bucketCount }, (_, index) => ({
  key: `lazy-${String(index).padStart(2, '0')}`,
  ownerSignatures: [], owners: new Set(), modules: new Set(), indices: new Set(),
}));
const replacements = new Map();
for (const group of lazy) {
  const hash = createHash('sha256').update(group.key).digest();
  const bucket = buckets[hash.readUInt32BE(0) % bucketCount];
  replacements.set(group.key, bucket.key);
  bucket.ownerSignatures.push(group.ownerSignature);
  for (const owner of group.owners) bucket.owners.add(owner);
  for (const moduleId of group.modules) bucket.modules.add(moduleId);
  for (const index of group.indices) bucket.indices.add(index);
}
manifest.groups = [initial, ...buckets.filter((bucket) => bucket.indices.size > 0).map((bucket) => ({
  key: bucket.key,
  ownerSignature: bucket.ownerSignatures.sort().join('|'),
  owners: [...bucket.owners].sort(),
  moduleCount: bucket.modules.size,
  modules: [...bucket.modules].sort(),
  indices: [...bucket.indices].sort((a, b) => a - b),
}))];
for (const consumer of Object.values(manifest.consumers)) {
  if (consumer.group && replacements.has(consumer.group)) consumer.group = replacements.get(consumer.group);
}
manifest.bucketCount = bucketCount;
fs.writeFileSync(output, JSON.stringify(manifest));
console.log(JSON.stringify({groups:manifest.groups.length, initialIndices:initial.indices.length, lazyIndices:[...new Set(manifest.groups.slice(1).flatMap(group=>group.indices))].length, bucketIndices:manifest.groups.slice(1).map(group=>[group.key,group.moduleCount,group.indices.length])}, null, 2));
