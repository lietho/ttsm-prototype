## Time-travelling State Machine Prototype for verifiable inter-organizational Business Processes
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.8374110.svg)](https://doi.org/10.5281/zenodo.8374110)

A prototypical implementation of a time-travelling state machine for inter-organizational business process and workflow management. This prototype shows the viability of time-travel verification of business process and
workflow activities that are backed by the immutability and traceability of a blockchain.
Collaboration with other business partner works with a peer-to-peer approach using [OrbitDB](https://github.com/orbitdb/orbit-db). The Rule Evaluator can be used to ensure compliance of the process with predefined terms and regulations.

This project is a fork of the TTSM prototype of @danielkleebinder ([danielkleebinder/ttsm-prototype](https://github.com/danielkleebinder/ttsm-prototype)) which was extended by @alexnavratil ([alexnavratil/ttsm-prototype/](https://github.com/alexnavratil/ttsm-prototype/)).

## Installing dependencies
### TTSM
The prototype is a node.js application. It was tested on [Node.js](https://nodejs.org/) 18.15.0 LTS.

```bash
> npm install
```

### Rule Evaluator
The Rule Evaluator requires a Java 17 runtime environment.

```bash
> mvn package
```

## Running the app

To run the app, [docker compose](https://www.docker.com/products/docker-desktop/) has to be installed locally. Afterwards, you have to choose which consistency strategy to use before continuing. 

To launch the event store DB, use the `launch event store.sh` shell script. To launch the TTSM and the Rule Evaluator use the VS Code launch configurations configured in `.vscode/launch.json`. There you can configure via the environment variable `CONSISTENCY_STRATEGY` which consistency strategy should be used. Allowed values are: ``orbitdb-emv``, ``orbitdb`` or ``noop``.

### No-Operation (NoOp) Strategy

This strategy is the simplest of all. It does not dispatch any messages to any other participants, but instead, just feeds everything back with a short delay simulating the network. This strategy is
useful for developing. If you are working locally, you can also set this strategy in your ``environment.ts`` file directly. Now you can either start your application using

### OrbitDB Strategy
The OrbitDB persistence and consistency strategies use the OrbitDB Event Log for storing all events and even exchanging events with other nodes (i.e., business partners running the ttsm-prototype).
The following environment variables can be configured in the ``launch.json`` file:

```properties
PERSISTENCE_ORBITDB_ID=organization-a
PERSISTENCE_ORBITDB_IPFS_PORT=4102
PERSISTENCE_ORBITDB_IPFS_PORT_WS=4103
```

- The `PERSISTENCE_ORBITDB_ID` assigns an identifier to the OrbitDB instance.
- The `PERSISTENCE_ORBITDB_IPFS_PORT` and `PERSISTENCE_ORBITDB_IPFS_PORT_WS` configures the swarm ports which are used in the local [js-ipfs](https://github.com/ipfs/js-ipfs) instance that gets started. 


### OrbitDB Ethereum Virtual Machine (EVM) Strategy
The `orbitdb-evm` consistency strategy uses the OrbitDB strategy in the background and additionally posts hash-based commitments onto an Ethereum Smart Contract.
Therefore, [web3.js](https://github.com/web3/web3.js) must be configured with a WebSocket address to an Ethereum client, an account address and a private key for signing the transactions.
Additionally, the address of the `HashStorage.sol` smart contract can be set, it is already pre-filled with a deployed contract address on the Ethereum Goerli Testnet that can be used for demonstration purposes.

## Register the Rule Evaluator with the TTSM
To register the Rule Evaluator with the TTSM you have to execute the following REST requests:

```
POST http://localhost:3000/rules/register
{
  "name": "Rule Evaluator",
  "url": "http://localhost:3000/rulesEvaluator"
} 
```

```
POST http://localhost:3001/rules/register
{
  "name": "Rule Evaluator",
  "url": "http://localhost:3001/rulesEvaluator"
} 
```

## Known Issues
- Due to OrbitDB still being in alpha-stage, it has issues running inside Docker containers. Even running the ttsm-prototype locally (outside Docker) does not work reliable all the time. Clearing the local IPFS and OrbitDB repository directories often helps.

## Stopping the app

If you started you application stacks using Docker, you can use the stop script ``stop.sh`` to stop all containers.

```bash
> stop event store.sh
```
