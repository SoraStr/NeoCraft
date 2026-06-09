import { describe, expect, it } from 'vitest';
import { buildSystemMessage } from '../ChatTab';

describe('ChatTab SMP payload helpers', () => {
  it('builds server/system_message with current online players as recipients', () => {
    const players = [
      { id: 'alex-id', name: 'Alex' },
      { id: 'steve-id', name: 'Steve' },
    ];

    expect(buildSystemMessage('Hello', false, players)).toEqual({
      message: { literal: 'Hello', translatable: '', translatableParams: [] },
      overlay: false,
      receivingPlayers: players,
    });
  });
});
