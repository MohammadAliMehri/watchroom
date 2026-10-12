import dns from 'node:dns/promises';
import { URL } from 'node:url';
import ipaddr from 'ipaddr.js';

/**
 * Validates a video URL against SSRF vulnerabilities (Section 4 Security Layer 1):
 * - Accepts only http and https protocols
 * - Resolves hostname via DNS
 * - Refuses if any resolved address is private, loopback, link-local, carrier-grade NAT, or reserved
 *
 * Specific server error: "That address is not allowed"
 */
export async function validateUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch (err) {
    throw new Error('Cannot read this link as video');
  }

  // Layer 1 check: Only http and https are accepted
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('That address is not allowed');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new Error('That address is not allowed');
  }

  // Resolve hostname (both IPv4 and IPv6)
  let addresses = [];
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    addresses = lookupResults.map(r => r.address);
  } catch (err) {
    throw new Error('Cannot read this link as video');
  }

  if (addresses.length === 0) {
    throw new Error('Cannot read this link as video');
  }

  // Check each resolved IP
  for (const ipStr of addresses) {
    if (isForbiddenIp(ipStr)) {
      throw new Error('That address is not allowed');
    }
  }

  return parsed;
}

export function isForbiddenIp(ipStr) {
  try {
    let addr = ipaddr.parse(ipStr);
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    const range = addr.range();

    // Blocked ranges:
    // private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
    // loopback (127.0.0.0/8, ::1)
    // linkLocal (169.254.0.0/16, fe80::/10)
    // carrierGradeNat (100.64.0.0/10)
    // reserved / multicast / broadcast / unspecified (0.0.0.0/8, etc.)
    const forbiddenRanges = [
      'private',
      'loopback',
      'linkLocal',
      'carrierGradeNat',
      'reserved',
      'multicast',
      'broadcast',
      'unspecified',
      'uniqueLocal'
    ];

    if (forbiddenRanges.includes(range)) {
      return true;
    }

    // Explicit subnet checks for safety
    if (addr.kind() === 'ipv4') {
      const octets = addr.octets;
      // 10.0.0.0/8
      if (octets[0] === 10) return true;
      // 172.16.0.0/12
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
      // 192.168.0.0/16
      if (octets[0] === 192 && octets[1] === 168) return true;
      // 127.0.0.0/8
      if (octets[0] === 127) return true;
      // 169.254.0.0/16 (cloud metadata, AWS, etc.)
      if (octets[0] === 169 && octets[1] === 254) return true;
      // 100.64.0.0/10
      if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
      // 0.0.0.0/8
      if (octets[0] === 0) return true;
    }

    return false;
  } catch {
    return true; // Parse failure -> disallow
  }
}
