import { describe, expect, it } from 'vitest';
import {
  normalizeStatusPayload,
  notificationMethodsFromDiscovery,
  playerEventsFromStatusChange,
  prependActivityEvents,
  subjectFromPayload,
} from '../../../hooks/useSmpActivity';
import type { ServerStatus } from '../../../lib/types';

function status(players: Array<{ id: string; name: string }>): ServerStatus {
  return {
    players,
    started: true,
    version: { name: '1.21.11', protocol: 0 },
  };
}

describe('OverviewTab activity helpers', () => {
  it('normalizes wrapped server/status payloads from SMP', () => {
    expect(normalizeStatusPayload({ status: status([{ id: 'alex-id', name: 'Alex' }]) })).toEqual(
      status([{ id: 'alex-id', name: 'Alex' }]),
    );
  });

  it('defaults missing players to an empty list so event refreshes cannot crash', () => {
    expect(normalizeStatusPayload({ status: { started: true } })).toEqual({
      players: [],
      started: true,
      version: { name: 'Unknown', protocol: 0 },
    });
  });

  it('derives join and leave events from server/status heartbeats', () => {
    const previous = status([
      { id: 'alex-id', name: 'Alex' },
      { id: 'steve-id', name: 'Steve' },
    ]);
    const next = status([
      { id: 'alex-id', name: 'Alex' },
      { id: 'jeb-id', name: 'jeb_' },
    ]);

    expect(playerEventsFromStatusChange(previous, next, 1000)).toEqual([
      { type: 'joined', subject: 'jeb_', time: 1000 },
      { type: 'left', subject: 'Steve', time: 1000 },
    ]);
  });

  it('does not duplicate the same activity event emitted immediately after a heartbeat', () => {
    const previous = [{ type: 'joined' as const, subject: 'Alex', time: 1000 }];
    const entries = [{ type: 'joined' as const, subject: 'Alex', time: 1500 }];

    expect(prependActivityEvents(previous, entries)).toEqual(previous);
  });

  it('extracts readable subjects from SMP notification payload variants', () => {
    expect(subjectFromPayload([{ player: { name: 'Alex' }, permissionLevel: 4 }])).toBe('Alex');
    expect(subjectFromPayload([{ player: { name: 'Steve' }, reason: 'test' }])).toBe('Steve');
    expect(subjectFromPayload([{ ip: '192.0.2.10', source: 'Server' }])).toBe('192.0.2.10');
    expect(subjectFromPayload([{ gamerule: { key: 'doDaylightCycle', value: true } }])).toBe('doDaylightCycle');
    expect(subjectFromPayload(['192.0.2.11'])).toBe('192.0.2.11');
  });

  it('extracts notification methods from rpc.discover schema variants', () => {
    expect(notificationMethodsFromDiscovery({
      methods: {
        'minecraft:notification/players/joined': {},
        custom: { method: 'myplugin:notification/chat/message' },
      },
      notifications: [
        { name: 'minecraft:notification/server/saved' },
        'myplugin:notification/performance/tick',
      ],
    })).toEqual([
      'minecraft:notification/players/joined',
      'minecraft:notification/server/saved',
      'myplugin:notification/chat/message',
      'myplugin:notification/performance/tick',
    ]);
  });
});
