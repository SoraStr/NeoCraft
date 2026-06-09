import { useCallback, useEffect, useRef, useState } from 'react';
import type { SmpClient } from '../lib/smp-client';
import type { ServerStatus } from '../lib/types';

export type ActivityType =
  | 'joined'
  | 'left'
  | 'serverStarted'
  | 'serverStopping'
  | 'serverSaving'
  | 'serverSaved'
  | 'activity'
  | 'operatorAdded'
  | 'operatorRemoved'
  | 'allowlistAdded'
  | 'allowlistRemoved'
  | 'ipBanAdded'
  | 'ipBanRemoved'
  | 'banAdded'
  | 'banRemoved'
  | 'gameruleUpdated'
  | 'custom';

export interface ActivityEntry {
  type: ActivityType;
  subject: string;
  label?: string;
  time: number;
}

interface NotificationSubscription {
  method: string;
  type: ActivityType;
  subject?: (params: unknown) => string;
}

const SERVER_SUBJECT = 'SMP';
const NOTIFICATION_PREFIX_PATTERN = /^[^:]+:notification\//;

export function normalizeStatusPayload(payload: unknown): ServerStatus | null {
  const data = Array.isArray(payload) ? payload[0] : payload;
  if (!data || typeof data !== 'object') return null;

  const maybeWrapped = data as { status?: unknown };
  const status = maybeWrapped.status && typeof maybeWrapped.status === 'object'
    ? maybeWrapped.status
    : data;
  const candidate = status as Partial<ServerStatus>;

  return {
    players: Array.isArray(candidate.players) ? candidate.players : [],
    started: candidate.started === true,
    version: candidate.version && typeof candidate.version === 'object'
      ? candidate.version as ServerStatus['version']
      : { name: 'Unknown', protocol: 0 },
  };
}

function playerKey(player: Pick<ServerStatus['players'][number], 'id' | 'name'>): string {
  return player.id || player.name;
}

function normalizeNotificationPlayer(params: unknown): ServerStatus['players'][number] | null {
  const data = Array.isArray(params) ? params[0] : params;
  if (!data || typeof data !== 'object') return null;

  const maybePlayer = data as { player?: unknown; id?: unknown; name?: unknown };
  const player = maybePlayer.player && typeof maybePlayer.player === 'object'
    ? maybePlayer.player as { id?: unknown; name?: unknown }
    : maybePlayer;

  if (typeof player.name !== 'string' || player.name.length === 0) return null;

  return {
    id: typeof player.id === 'string' ? player.id : '',
    name: player.name,
  };
}

function firstParam(params: unknown): unknown {
  return Array.isArray(params) ? params[0] : params;
}

export function subjectFromPayload(params: unknown, fallback = SERVER_SUBJECT): string {
  const value = firstParam(params);
  return subjectFromValue(value) || fallback;
}

function subjectFromValue(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!value || typeof value !== 'object') return null;

  const record = value as {
    name?: unknown;
    ip?: unknown;
    key?: unknown;
    player?: unknown;
    gamerule?: unknown;
  };

  if (typeof record.name === 'string' && record.name.length > 0) return record.name;
  if (typeof record.ip === 'string' && record.ip.length > 0) return record.ip;
  if (typeof record.key === 'string' && record.key.length > 0) return record.key;

  return subjectFromValue(record.player) || subjectFromValue(record.gamerule);
}

const EXTRA_NOTIFICATION_SUBSCRIPTIONS: NotificationSubscription[] = [
  { method: 'server/started', type: 'serverStarted', subject: () => SERVER_SUBJECT },
  { method: 'server/stopping', type: 'serverStopping', subject: () => SERVER_SUBJECT },
  { method: 'server/saving', type: 'serverSaving', subject: () => SERVER_SUBJECT },
  { method: 'server/saved', type: 'serverSaved', subject: () => SERVER_SUBJECT },
  { method: 'server/activity', type: 'activity', subject: () => SERVER_SUBJECT },
  { method: 'operators/added', type: 'operatorAdded', subject: subjectFromPayload },
  { method: 'operators/removed', type: 'operatorRemoved', subject: subjectFromPayload },
  { method: 'allowlist/added', type: 'allowlistAdded', subject: subjectFromPayload },
  { method: 'allowlist/removed', type: 'allowlistRemoved', subject: subjectFromPayload },
  { method: 'ip_bans/added', type: 'ipBanAdded', subject: subjectFromPayload },
  { method: 'ip_bans/removed', type: 'ipBanRemoved', subject: subjectFromPayload },
  { method: 'bans/added', type: 'banAdded', subject: subjectFromPayload },
  { method: 'bans/removed', type: 'banRemoved', subject: subjectFromPayload },
  { method: 'gamerules/updated', type: 'gameruleUpdated', subject: subjectFromPayload },
];
const BUILT_IN_NOTIFICATION_METHODS = new Set([
  'minecraft:notification/players/joined',
  'minecraft:notification/players/left',
  'minecraft:notification/server/status',
  ...EXTRA_NOTIFICATION_SUBSCRIPTIONS.map((subscription) => `minecraft:notification/${subscription.method}`),
]);

export function notificationMethodsFromDiscovery(discovery: unknown): string[] {
  const methods = new Set<string>();
  collectNotificationMethods(discovery, methods);
  return [...methods].sort();
}

function collectNotificationMethods(value: unknown, methods: Set<string>): void {
  if (typeof value === 'string') {
    if (NOTIFICATION_PREFIX_PATTERN.test(value)) methods.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectNotificationMethods(item, methods);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (NOTIFICATION_PREFIX_PATTERN.test(key)) methods.add(key);

    if ((key === 'method' || key === 'name') && typeof nested === 'string' && NOTIFICATION_PREFIX_PATTERN.test(nested)) {
      methods.add(nested);
      continue;
    }

    collectNotificationMethods(nested, methods);
  }
}

function labelFromNotificationMethod(method: string): string {
  return method.replace(NOTIFICATION_PREFIX_PATTERN, '').replaceAll('/', ' / ');
}

export function playerEventsFromStatusChange(
  previous: ServerStatus | null,
  next: ServerStatus,
  now = Date.now(),
): ActivityEntry[] {
  if (!previous) return [];

  const previousPlayers = new Map(previous.players.map((player) => [playerKey(player), player]));
  const nextPlayers = new Map(next.players.map((player) => [playerKey(player), player]));
  const events: ActivityEntry[] = [];

  for (const [key, player] of nextPlayers) {
    if (!previousPlayers.has(key)) {
      events.push({ type: 'joined', subject: player.name, time: now });
    }
  }

  for (const [key, player] of previousPlayers) {
    if (!nextPlayers.has(key)) {
      events.push({ type: 'left', subject: player.name, time: now });
    }
  }

  return events;
}

export function prependActivityEvents(
  previous: ActivityEntry[],
  entries: ActivityEntry[],
): ActivityEntry[] {
  if (entries.length === 0) return previous;

  const deduped = entries.filter((entry) => {
    const latest = previous.find((item) => item.type === entry.type && item.subject === entry.subject);
    return !latest || Math.abs(entry.time - latest.time) > 2000;
  });

  return [...deduped, ...previous].slice(0, 20);
}

export function useSmpActivity(client: SmpClient) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEntry[]>([]);
  const statusRef = useRef<ServerStatus | null>(null);

  const updateStatus = useCallback((next: ServerStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.call('server/status');
      const nextStatus = normalizeStatusPayload(result);
      if (!nextStatus) throw new Error('Invalid server status payload.');
      updateStatus(nextStatus);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch server status.');
    } finally {
      setLoading(false);
    }
  }, [client, updateStatus]);

  useEffect(() => {
    void fetchStatus();

    const unsubJoin = client.onNotification('players/joined', (params: unknown) => {
      const player = normalizeNotificationPlayer(params);
      if (!player) return;

      setEvents((prev) => prependActivityEvents(prev, [
        { type: 'joined', subject: player.name, time: Date.now() },
      ]));
      const current = statusRef.current;
      if (!current || current.players.some((item) => playerKey(item) === playerKey(player))) return;
      updateStatus({ ...current, players: [...current.players, player] });
    });

    const unsubLeft = client.onNotification('players/left', (params: unknown) => {
      const player = normalizeNotificationPlayer(params);
      if (!player) return;

      setEvents((prev) => prependActivityEvents(prev, [
        { type: 'left', subject: player.name, time: Date.now() },
      ]));
      const current = statusRef.current;
      if (!current) return;
      updateStatus({
        ...current,
        players: current.players.filter((item) => playerKey(item) !== playerKey(player)),
      });
    });

    const unsubStatus = client.onNotification('server/status', (params: unknown) => {
      const nextStatus = normalizeStatusPayload(params);
      if (!nextStatus) return;

      const current = statusRef.current;
      setEvents((events) => prependActivityEvents(events, playerEventsFromStatusChange(current, nextStatus)));
      updateStatus(nextStatus);
    });

    const extraUnsubs = EXTRA_NOTIFICATION_SUBSCRIPTIONS.map((subscription) => (
      client.onNotification(subscription.method, (params: unknown) => {
        setEvents((prev) => prependActivityEvents(prev, [
          {
            type: subscription.type,
            subject: subscription.subject?.(params) ?? SERVER_SUBJECT,
            time: Date.now(),
          },
        ]));
      })
    ));
    let active = true;
    let dynamicUnsubs: Array<() => void> = [];

    client.callRaw('rpc.discover').then((discovery) => {
      const subscriptions = notificationMethodsFromDiscovery(discovery)
        .filter((method) => !BUILT_IN_NOTIFICATION_METHODS.has(method))
        .map((method) => client.onRawNotification(method, (params: unknown) => {
          setEvents((prev) => prependActivityEvents(prev, [
            {
              type: 'custom',
              subject: subjectFromPayload(params, labelFromNotificationMethod(method)),
              label: labelFromNotificationMethod(method),
              time: Date.now(),
            },
          ]));
        }));
      if (!active) {
        for (const unsubscribe of subscriptions) unsubscribe();
        return;
      }
      dynamicUnsubs = subscriptions;
    }).catch(() => {
      // Older snapshots may not expose discovery yet; built-in notifications still work.
    });

    return () => {
      active = false;
      unsubJoin();
      unsubLeft();
      unsubStatus();
      for (const unsubscribe of extraUnsubs) unsubscribe();
      for (const unsubscribe of dynamicUnsubs) unsubscribe();
    };
  }, [client, fetchStatus, updateStatus]);

  return {
    status,
    loading,
    error,
    events,
    retry: fetchStatus,
  };
}
