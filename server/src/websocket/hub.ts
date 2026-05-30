interface WebSocketLike {
  send(data: string): void;
  readyState: number;
  on(event: string, callback: () => void): void;
}

interface IpcEvent {
  event: string;
  data: Record<string, unknown>;
}

export class WebSocketHub {
  private clients = new Set<WebSocketLike>();

  addClient(ws: WebSocketLike): void {
    this.clients.add(ws);

    // Handle client disconnect
    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  removeClient(ws: WebSocketLike): void {
    this.clients.delete(ws);
  }

  broadcast(event: IpcEvent): void {
    const message = JSON.stringify(event);
    for (const ws of this.clients) {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      } catch {
        // Client might have disconnected, remove it
        this.clients.delete(ws);
      }
    }
  }

  getConnectedCount(): number {
    return this.clients.size;
  }
}
