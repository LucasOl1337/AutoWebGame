import assert from "node:assert/strict";

const jcs = await import("../output/esm/Shared/canonical-json.js");

assert.equal(jcs.canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
assert.equal(jcs.canonicalJson([-0, 1e30, 0.000001, 1e-7]), '[0,1e+30,0.000001,1e-7]');
assert.equal(
  jcs.canonicalJson({ "€": "Euro", "\r": "CR", "דּ": "Hebrew", "\u0001": "SOH", "😀": "Emoji", "\u0080": "Control", "ö": "Latin" }),
  '{"\\u0001":"SOH","\\r":"CR","":"Control","ö":"Latin","€":"Euro","😀":"Emoji","דּ":"Hebrew"}',
);
assert.throws(() => jcs.canonicalJson("\ud800"), /unpaired surrogate/i);
assert.throws(() => jcs.canonicalJson(Number.NaN), /non-finite/i);
assert.throws(() => jcs.canonicalJson({ a: undefined }), /undefined/i);
assert.throws(() => jcs.canonicalJson([undefined]), /undefined/i);
assert.throws(() => jcs.canonicalJson(new Array(1)), /array hole/i);
const arrayWithAccessor = [];
Object.defineProperty(arrayWithAccessor, "0", { enumerable: true, configurable: true, get: () => 7 });
arrayWithAccessor.length = 1;
assert.throws(() => jcs.canonicalJson(arrayWithAccessor), /array data properties/i);
const arrayWithHiddenIndex = [];
Object.defineProperty(arrayWithHiddenIndex, "0", { enumerable: false, configurable: true, writable: true, value: 7 });
arrayWithHiddenIndex.length = 1;
assert.throws(() => jcs.canonicalJson(arrayWithHiddenIndex), /array data properties/i);
assert.throws(() => jcs.canonicalJson({ a: () => true }), /function/i);
assert.throws(() => jcs.canonicalJson(Symbol("unsupported")), /symbol/i);
assert.throws(() => jcs.canonicalJson(1n), /bigint/i);
assert.throws(() => jcs.canonicalJson(new Date(0)), /plain objects/i);
const objectWithSymbol = { a: 1 };
objectWithSymbol[Symbol("hidden")] = 2;
assert.throws(() => jcs.canonicalJson(objectWithSymbol), /symbol properties/i);
const arrayWithExtraProperty = [1];
arrayWithExtraProperty.extra = true;
assert.throws(() => jcs.canonicalJson(arrayWithExtraProperty), /extra properties/i);
const arrayWithHiddenExtra = [1];
Object.defineProperty(arrayWithHiddenExtra, "hidden", { enumerable: false, value: true });
assert.throws(() => jcs.canonicalJson(arrayWithHiddenExtra), /extra properties/i);
assert.equal(jcs.canonicalJson([7, { dense: true }, null]), '[7,{"dense":true},null]');
assert.notEqual(jcs.canonicalJson({}), jcs.canonicalJson({ a: null }));
assert.notEqual(jcs.canonicalJson([null]), jcs.canonicalJson([]));
assert.equal(
  await jcs.sha256Canonical({}),
  "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
);

console.log(JSON.stringify({ pass: true, vectors: 22 }, null, 2));
