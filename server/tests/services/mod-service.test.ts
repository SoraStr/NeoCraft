import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseModJar } from '../../src/services/mod-service';

async function makeJar(pluginYml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('plugin.yml', pluginYml);
  zip.file('com/example/MyPlugin.class', Buffer.from([0]));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('parseModJar', () => {
  it('reads Bukkit plugin.yml description and a single author', async () => {
    const jar = await makeJar(`
name: WorldEdit
version: "7.4.0"
main: com.sk89q.worldedit.bukkit.WorldEditPlugin
description: In-game map editor
author: EngineHub
api-version: "1.13"
`);

    const result = await parseModJar(jar, 'worldedit.jar', jar.length, false);

    expect(result).toMatchObject({
      fileName: 'worldedit.jar',
      name: 'WorldEdit',
      modid: 'WorldEdit',
      version: '7.4.0',
      loader: 'bukkit',
      size: jar.length,
      disabled: false,
      description: 'In-game map editor',
      authors: ['EngineHub'],
    });
  });

  it('reads Bukkit plugin.yml authors lists', async () => {
    const jar = await makeJar(`
name: EssentialsX
version: 2.21.0
main: com.earth2me.essentials.Essentials
description: Essential commands for servers
authors:
  - drtshock
  - EssentialsX Team
api-version: 1.20
`);

    const result = await parseModJar(jar, 'EssentialsX.jar.disabled', jar.length, true);

    expect(result).toMatchObject({
      fileName: 'EssentialsX.jar.disabled',
      name: 'EssentialsX',
      version: '2.21.0',
      loader: 'bukkit',
      disabled: true,
      description: 'Essential commands for servers',
      authors: ['drtshock', 'EssentialsX Team'],
    });
  });
});
