import { Store } from "orbit-db";
import { Subject } from "rxjs";

export class EventNotifier<T> {
  private readonly eventSubject = new Subject<T>();

  public readonly events$ = this.eventSubject.asObservable();

  constructor(private db: Store){
    this.setup();
  }

  private setup() {
    let cachedEntries = [];

    this.db.events.on("replicate", () => {
      if (cachedEntries.length > 0) {
        throw new Error("Concurrent replication detected!")
      }
    });

    this.db.events.on("replicate.progress", (address, hash, entry) => {
      cachedEntries.push(entry);
    });

    this.db.events.on("replicated", () => {
      cachedEntries.sort((a, b) => a.clock.time - b.clock.time);
      cachedEntries.forEach(entry => this.eventSubject.next(entry));

      cachedEntries = [];
    });
  }
}