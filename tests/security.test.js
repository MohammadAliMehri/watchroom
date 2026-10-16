import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import {
  validateUrl,
  isForbiddenIp,
  assertMediaEgressProtection,
} from "../src/security.js";

test("Media security rejects local, metadata and mapped IPv6 destinations", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isForbiddenIp(ip), true, ip);
  }
  assert.equal(isForbiddenIp("93.184.215.14"), false);
});

test("Media URL validation rejects DNS answers containing any private address", async (t) => {
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.215.14", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]);
  await assert.rejects(
    validateUrl("https://media.example/movie.mkv"),
    /That address is not allowed/,
  );
});

test("Media URL validation allows a public source and rejects non-HTTP protocols", async (t) => {
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.215.14", family: 4 },
  ]);
  const url = await validateUrl(
    "https://media.example/movie.mkv?token=example",
  );
  assert.equal(url.pathname, "/movie.mkv");
  for (const source of [
    "file:///etc/passwd",
    "ftp://media.example/movie.mkv",
  ]) {
    await assert.rejects(validateUrl(source), /That address is not allowed/);
  }
});

test("Production conversion fails closed without OS egress protection", (t) => {
  const prior = {
    ...Object.fromEntries(
      ["NODE_ENV", "MEDIA_EGRESS_PROTECTED", "ALLOW_UNSAFE_MEDIA_FETCHES"].map(
        (name) => [name, process.env[name]],
      ),
    ),
  };
  t.after(() => {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.NODE_ENV = "production";
  delete process.env.MEDIA_EGRESS_PROTECTED;
  process.env.ALLOW_UNSAFE_MEDIA_FETCHES = "true";
  assert.throws(
    () => assertMediaEgressProtection("https://media.example/movie.mkv"),
    /OS-level egress protection/,
  );
  process.env.MEDIA_EGRESS_PROTECTED = "true";
  assert.doesNotThrow(() =>
    assertMediaEgressProtection("https://media.example/movie.mkv"),
  );
});
