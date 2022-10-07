## Time-travelling State Machine Prototype for verifiable Business Processes

A prototypical implementation of a time-travelling state machine for business process and workflow management. This prototype shows the viability of time-travel verification of business process and
workflow activities that are backed by the immutability and traceability of a blockchain.

## Installing dependencies
The application solely relies on node packages. Therefore, you can use your preferred node package manager to install all required dependencies.

```bash
> npm install
> yarn install
```

## Running the app

To run the app, [docker compose](https://www.docker.com/products/docker-desktop/) has to be installed locally. Afterwards, you have to choose which consistency strategy to use before continuing. For
this, edit both environment files ``.env-stack-1`` and ``.env-stack-1`` in the ``/config`` directory and either use ``noop``, ``p2p`` or ``evm`` as your
``CONSISTENCY_STRATEGY``. Afterwards continue on with the applicable follow-up section:

### No-Operation (NoOp) Strategy

This strategy is the simplest of all. It does not dispatch any messages to any other participants, but instead, just feeds everything back with a short delay simulating the network. This strategy is
useful for developing. If you are working locally, you can also set this strategy in your ``environment.ts`` file directly. Now you can either start your application using

```bash
> npm run start
```

or by leveraging on your Docker environment by using the launch script ``launch.sh``

```bash
> launch.sh
```

### Point-2-Point (P2P) Strategy

The point-2-point strategy directly sends messages from one participant to all the other ones. This strategy does not really have any consistency mechanism in place and should therefore only be used
in development as well. Technically, the p2p-strategy supports more than two participants. Just configure you environment files as follows:

```bash
CONSISTENCY_STRATEGY=p2p
CONSISTENCY_P2P_PEER_URLS=http://host.docker.internal:3001 http://host.docker.internal:3002 http://host.docker.internal:3003 ...
```

After everything has been configured, you can start your stacks using the launch script ``launch.sh``

```bash
> launch.sh
```

### Ethereum Virtual Machine (EVM) Strategy
The EVM strategy uses an Ethereum virtual machine to deploy a smart contract that stores a list of hashes. These hashes are derived from the messages exchanged between participants. To launch this
strategy, you require some sort of EVM that is capable of hosting smart contracts. An example for such a system, that's rather easy to set up, is [Ganache](https://trufflesuite.com/docs/ganache/).
Launch your blockchain locally or use an existing testnet and deploy the smart contract ``/contracts/hash-storage.sol``. Everything is pre-configured for the Truffle Suite and should work
out-of-the-box using the following command:

```bash
> truffle migrate
```

Deploying the smart contract will return an address where the smart contract is now available on the EVM. Use this address for **all stacks** by assigning it to ``CONSISTENCY_EVM_CONTRACT_ADDRESS``
in the applicable environment files in ``/config``. Similar to the p2p-strategy, you also have to use peer URLs for all your participants to exchange the messages (the EVM is only used to store
the hashes).

```bash
CONSISTENCY_STRATEGY=evm
CONSISTENCY_EVM_PEER_URLS=http://host.docker.internal:3001 http://host.docker.internal:3002 http://host.docker.internal:3003 ...
```

Afterwards, you have to add a client wallet address that pays for all the hash transactions required, and a provider that writes the transactions to the EVM.

```bash
CONSISTENCY_EVM_PROVIDER=ws://host.docker.internal:7545
CONSISTENCY_EVM_CLIENT_ADDRESS=0x05a797C381431c9CB7513f825E01F9Ae304A0AcE
```

After everything has been configured, you can start your stacks using the launch script ``launch.sh``

```bash
> launch.sh
```

## Stopping the app

If you started you application stacks using Docker, you can use the stop script ``stop.sh`` to stop all containers.

```bash
> stop.sh
```

## Nice Stuff:

- Interesting workflows in https://github.com/jan-ladleif/bpm19-blockchain-based-choreographies
- Event sourcing naming conventions: https://www.eventstore.com/blog/whats-in-an-event-name
    - Follow the subject.object.predicate pattern (e.g. "system.workflow.proposed")
- Event sourcing mistakes: http://www.natpryce.com/
