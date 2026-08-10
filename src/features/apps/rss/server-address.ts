import { isIP } from 'node:net';

export interface DnsAddressRecord {
  address: string;
  family: number;
}

// 将IPv4地址字符串拆分为数字数组
function getIpv4Octets(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split('.').map(Number);
}

// 解析IPv6地址字符串为16位分组数字数组
function parseIpv6(address: string): number[] | null {
  const segments = address.toLowerCase().split('::');
  if (segments.length > 2) return null;

  const head = segments[0] ? segments[0].split(':') : [];
  const tail = segments[1] ? segments[1].split(':') : [];
  const groups = [...head, ...tail];
  const lastGroup = groups.at(-1);

  if (lastGroup?.includes('.')) {
    const octets = getIpv4Octets(lastGroup);
    if (!octets) return null;
    groups.splice(-1, 1, `${(octets[0] << 8) | octets[1]}`, `${(octets[2] << 8) | octets[3]}`);
  }

  if (groups.length > 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if (segments.length === 1 && groups.length !== 8) return null;

  const missingGroups = 8 - groups.length;
  const headLength = head.length;
  return [
    ...groups.slice(0, headLength).map((group) => Number.parseInt(group, 16)),
    ...Array(missingGroups).fill(0),
    ...groups.slice(headLength).map((group) => Number.parseInt(group, 16)),
  ];
}

// 判断地址是否为私有、保留或不可路由地址
export function isPrivateAddress(address: string): boolean {
  const octets = getIpv4Octets(address);
  if (octets) {
    const [a, b] = octets;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  const groups = parseIpv6(address);
  if (!groups) return true;

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const isDeprecatedSiteLocal = (groups[0] & 0xffc0) === 0xfec0;
  const isEmbeddedIpv4 = groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff);

  if (isEmbeddedIpv4) {
    const embeddedIpv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isPrivateAddress(embeddedIpv4);
  }

  return isUnspecified || isLoopback || isLinkLocal || isUniqueLocal || isDeprecatedSiteLocal;
}

// 从DNS结果中选择第一个公开地址，不信任保留网段中继
export function selectPublicAddress(records: DnsAddressRecord[]): DnsAddressRecord | undefined {
  return records.find((record) => !isPrivateAddress(record.address));
}
