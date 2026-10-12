import fs from 'node:fs';
const [input, output] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
const initial = manifest.groups.find((group) => group.key === 'initial');
const otherGroups = manifest.groups.filter((group) => group.key !== 'initial');
const promoted = otherGroups.filter((group) => group.key !== 'lazy-07');
const deferred = otherGroups.filter((group) => group.key === 'lazy-07');
const indices = new Set(initial.indices);
const modules = new Set(initial.modules);
const owners = new Set(initial.owners);
for (const group of promoted) {
  for (const index of group.indices) indices.add(index);
  for (const moduleId of group.modules) modules.add(moduleId);
  for (const owner of group.owners) owners.add(owner);
}
const mergedInitial = {
  ...initial,
  ownerSignature: '["initial", "browser-first-route"]',
  owners: [...owners].sort(),
  modules: [...modules].sort(),
  moduleCount: modules.size,
  indices: [...indices].sort((a, b) => a - b),
};
const promotedKeys = new Set(promoted.map((group) => group.key));
for (const consumer of Object.values(manifest.consumers)) {
  if (consumer.group && promotedKeys.has(consumer.group)) consumer.group = 'initial';
}
manifest.groups = [mergedInitial, ...deferred];
manifest.routePromotion = { promotedGroups: [...promotedKeys].sort(), retainedLazyGroups: deferred.map((group) => group.key) };
fs.writeFileSync(output, JSON.stringify(manifest));
console.log(JSON.stringify({
  groups: manifest.groups.map(({ key, moduleCount, indices }) => ({ key, moduleCount, keys: indices.length })),
  promotedGroups: manifest.routePromotion.promotedGroups,
}, null, 2));
