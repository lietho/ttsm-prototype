## Time-travelling State Machine Prototype for verifiable Business Processes

A prototypical implementation of a time-travelling state machine for business process and workflow management. This prototype shows the viability of time-travel verification of business process and
workflow activities that are backed by the immutability and traceability of a blockchain.

## Running the app

To run the app, [docker compose](https://www.docker.com/products/docker-desktop/) has to be installed locally. Afterwards, run the following command to launch all services required. The start-up
process may take a couple of minutes if dependencies must be downloaded

```bash
docker-compose up
```

## Questions:

- Accept and reject of workflows, instances and transitions are implicit. Should the user handle this?

## Nice Stuff:

- Interesting workflows in https://github.com/jan-ladleif/bpm19-blockchain-based-choreographies
