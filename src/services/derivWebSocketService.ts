
export class DerivWebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reqId = 1;
  private activeSubscriptions = new Map<number, (data: any) => void>();

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("WebSocket Connected");
        resolve();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.req_id && this.activeSubscriptions.has(data.req_id)) {
            const callback = this.activeSubscriptions.get(data.req_id)!;
            callback(data);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("WebSocket Disconnected");
        // Implement auto-reconnect logic here
      };
    });
  }

  send(request: any, callback?: (data: any) => void): number {
    const reqId = this.reqId++;
    request.req_id = reqId;
    if (callback) {
        this.activeSubscriptions.set(reqId, callback);
    }
    this.ws?.send(JSON.stringify(request));
    return reqId;
  }

  // Phase 7: Account Management
  getBalance(subscribe: boolean = false, callback: (data: any) => void) {
    this.send({ balance: 1, subscribe: subscribe ? 1 : 0 }, callback);
  }

  getPortfolio(callback: (data: any) => void) {
    this.send({ portfolio: 1 }, callback);
  }

  // Phase 8: Market Data
  getActiveSymbols(callback: (data: any) => void) {
    this.send({ active_symbols: 'brief' }, callback);
  }

  subscribeTicks(symbols: string[], callback: (data: any) => void) {
    this.send({ ticks: symbols, subscribe: 1 }, callback);
  }

  // Phase 9: Trading Operations
  getProposal(proposal: any, callback: (data: any) => void) {
    this.send({ proposal: 1, ...proposal }, callback);
  }

  buyContract(proposalId: string, price: number, callback: (data: any) => void) {
    this.send({ buy: proposalId, price }, callback);
  }

  // Phase 10: System
  ping(callback: (data: any) => void) {
    this.send({ ping: 1 }, callback);
  }

  forget(id: string) {
      this.send({ forget: id });
  }
}
