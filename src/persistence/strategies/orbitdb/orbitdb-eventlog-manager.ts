import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EventStore } from "orbit-db-eventstore";
import { BehaviorSubject, map, merge, Observable, ReplaySubject, Subject, switchMap } from "rxjs";
import { environment } from "src/environment";
import { importDynamic } from "src/persistence/strategies/orbitdb/util/import-dynamic";
import { EventNotifier } from "./util";

type Connection<T> = {
  store: EventStore<T>,
  eventNotifier: EventNotifier<T>,
  localEvents: Subject<T>
}

@Injectable()
export class OrbitDBEventLogManager<T> implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrbitDBEventLogManager.name);

  private readonly connections = new Map<string, Connection<T>>();

  private readonly connectionSubject = new BehaviorSubject<void>(null);

  private orbitdb: any;

  private managerReadySubject = new ReplaySubject<void>(1);

  public readonly managerReady$ = this.managerReadySubject.asObservable();

  public readonly all$: Observable<T> = this.connectionSubject.pipe(
    map(() => this.getConnections().map(name => this.getObservable(name))),
    switchMap((eventObservables: Observable<T>[]) => merge(...eventObservables))
  );

  async onModuleInit() {
    this.logger.debug("Connecting to IPFS and OrbitDB");
    const { create } = await importDynamic("ipfs-http-client");
    const orbitdb = (await importDynamic("orbit-db")).default;
    const ipfs = await create({ url: new URL(environment.persistence.orbitDB.ipfsUrl) });

    this.orbitdb = await orbitdb.createInstance(ipfs, {
      directory: environment.persistence.orbitDB.localDirectory,
      id: environment.persistence.orbitDB.id
    });

    this.managerReadySubject.next();
  }

  public get identityId(): string {
    return this.orbitdb.identity.id;
  }

  public async addConnection(name: string, options: OrbitDBConnectionOptions) {
    this.logger.debug(`Opening connection to database "${name}"`);
    if (this.hasConnection(name)) {
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

    this.connections.set(name, { store, eventNotifier, localEvents });
    this.connectionSubject.next();
  }

  public async removeConnection(name: string) {
    this.logger.debug(`Disconnecting from database "${name}"`);
    if(!this.hasConnection(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    const connection = this.connections.get(name);
    await connection.store.close();
    this.connections.delete(name);
  }

  public getConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  public hasConnection(name: string): boolean {
    return this.connections.has(name);
  }

  public async readStream(name: string): Promise<T[]> {
    this.logger.debug(`Reading all events from database "${name}"`);
    if (!this.hasConnection(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    const store = this.connections.get(name).store;
    const entries = store.iterator({ limit: -1 }).collect() as any[]; // LogEntry[]
    return Promise.resolve(entries.map(e => e.payload.value));
  }

  public getObservable(name: string): Observable<T> {
    if (!this.hasConnection(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    const connection = this.connections.get(name);
    return merge(connection.eventNotifier.events$, connection.localEvents);
  }

  public async addEvent(name: string, event: T, propagateLocally = true) {
    this.logger.debug(`adding event to database "${name}": ${JSON.stringify(event)}`);

    if (!this.hasConnection(name)) {
      throw new Error(`Connection with name "${name}" not found!`);
    }

    // remove all undefined values as IPLD cannot encode undefined
    const cleanedEvent = JSON.parse(JSON.stringify(event));

    const connection = this.connections.get(name);
    const store = connection.store;
    await store.add(cleanedEvent);

    if (propagateLocally) {
      connection.localEvents.next(cleanedEvent);
    }
  }

  async onModuleDestroy() {
    await Promise.all(
      Array.from(this.connections.values()).map(conn => conn.store.close())
    );

    await this.orbitdb.disconnect();
  }
}

export interface OrbitDBConnectionOptions {
  type: string,
  accessController: {
    write: string[]
  }
}