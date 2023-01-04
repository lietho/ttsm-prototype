import { BehaviorSubject, map, merge, Observable, Subject, switchMap } from "rxjs";
import { EventStore } from "orbit-db-eventstore";
import { tap } from "rxjs/operators";
import { environment } from "src/environment";
import { importDynamic } from "src/persistence/strategies/orbitdb/util/import-dynamic";
import { EventNotifier } from "./util";

type Connection<T> = {
  store: EventStore<T>,
  eventNotifier: EventNotifier<T>,
  localEvents: Subject<T>
}

export class OrbitDBEventLogManager<T> {
  private ipfs: any;
  private orbitdb: any;

  private readonly connections = new Map<string, Connection<T>>();

  private readonly connectionSubject = new BehaviorSubject<void>(null);

  public readonly all$: Observable<T> = this.connectionSubject.pipe(
    map(() => this.getConnections().map(name => this.getObservable(name))),
    switchMap((eventObservables: Observable<T>[]) => merge(...eventObservables))
  );

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
  }

  public get identityId(): string {
    return this.orbitdb.identity.id;
  }

  public static async create<T>(): Promise<OrbitDBEventLogManager<T>> {
    const instance = new OrbitDBEventLogManager<T>();
    await instance.init();

    return instance;
  }

  public async addConnection(name: string, options: OrbitDBConnectionOptions) {
    if (this.connections.has(name)) {
      throw new Error(`A connection to the database "${name}" already exists!`);
    }

    const store = await this.orbitdb.open(name, {
      ...options,
      accessController: {
        ...options.accessController,
        type: 'ipfs' // use IpfsAccessController as it is the only one which allows deterministic address calculation of DBs
      },
      create: true,
      replicationConcurrency: 1
    });

    const eventNotifier = new EventNotifier<T>(store);
    const localEvents = new Subject<T>();

    await store.load();

    this.connections.set(name, {store, eventNotifier, localEvents});
    this.connectionSubject.next();
  }

  public getConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  public hasConnection(name: string): boolean {
    return this.connections.has(name);
  }

  public async readStream(name: string): Promise<T[]> {
    if (!this.connections.has(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    const store = this.connections.get(name).store;
    const entries = store.iterator({ limit: -1 }).collect() as any[]; // LogEntry[]
    return Promise.resolve(entries.map(e => e.payload.value))
  }

  public getObservable(name: string): Observable<T> {
    if (!this.connections.has(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    const connection = this.connections.get(name);
    return merge(connection.eventNotifier.events$, connection.localEvents);
  }

  public async addEvent(name: string, event: T) {
    if (!this.connections.has(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    const connection = this.connections.get(name);
    const store = connection.store;
    await store.add(event);

    connection.localEvents.next(event);
  }

  public async close(): Promise<void> {
    await this.orbitdb.disconnect();
  }

  private async init() {
    // workaround for dynamic imports: https://github.com/microsoft/TypeScript/issues/43329
    const { create } = await importDynamic("ipfs-http-client");
    const OrbitDB = await importDynamic("orbit-db");
    this.ipfs = await create({ url: new URL(environment.persistence.orbitDB.ipfsUrl) });
    this.orbitdb = await OrbitDB.default.createInstance(this.ipfs, {
      directory: environment.persistence.orbitDB.localDirectory,
      id: environment.persistence.orbitDB.id
    });
  }
}

export interface OrbitDBConnectionOptions {
  type: string,
  accessController: {
    write: string[]
  }
}