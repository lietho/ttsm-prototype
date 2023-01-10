import { Store } from "orbit-db";
import { Subject } from "rxjs";

export class EventNotifier<T> {
  private readonly eventSubject = new Subject<LogEntry<T>>();

  public readonly events$ = this.eventSubject.asObservable();

  constructor(private db: Store){
    this.setup();
  }

  private setup() {
    let cachedEntries = [];

    this.db.events.on("replicate", () => {
      console.log("replicate", cachedEntries.length);
      if (cachedEntries.length > 0) {
        console.error("Concurrent replication detected!")
      }
    });

    this.db.events.on("replicate.progress", (address, hash, entry, progress, have) => {
      console.log("replicate.progress", cachedEntries.length, entry, progress, have);
      cachedEntries.push(entry);
    });

    this.db.events.on("replicated", () => {
      console.log("replicate", cachedEntries.length);
      cachedEntries.sort((a, b) => a.clock.time - b.clock.time);
      cachedEntries.forEach(entry => this.eventSubject.next(entry));

      cachedEntries = [];
    });
  }
}

export interface LogEntry<T> {
  hash: string,
  id: string,
  next: string[],
  payload: {
    value: T
  },
  identity: { id: string }
}