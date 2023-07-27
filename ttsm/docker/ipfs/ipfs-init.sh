#!/bin/sh
jsipfs init

jsipfs config Addresses.Swarm --json "[\"/ip4/0.0.0.0/tcp/$STACK_IPFS_SWARM_PORT1\",\"/ip4/0.0.0.0/tcp/$STACK_IPFS_SWARM_PORT2/ws\"]"

jsipfs daemon