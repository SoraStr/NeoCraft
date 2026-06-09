import { describe, expect, it } from 'vitest';
import { extractMinecraftVersion, versionAtLeast } from '../version';

describe('version helpers', () => {
  it('extracts Minecraft versions from loader-specific labels', () => {
    expect(extractMinecraftVersion('1.20.1 Forge 47.2.0')).toBe('1.20.1');
    expect(extractMinecraftVersion('1.21.4 Fabric 0.16.10')).toBe('1.21.4');
    expect(extractMinecraftVersion('1.21.10')).toBe('1.21.10');
  });

  it('compares labels by their Minecraft version', () => {
    expect(versionAtLeast('1.21.10 Fabric 0.17.3', 1, 21, 9)).toBe(true);
    expect(versionAtLeast('1.20.1 Forge 47.2.0', 1, 21, 0)).toBe(false);
  });
});
