// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Hash Storage
 * @dev Store 256-bit hash values as event log
 */
contract HashStorage {

    /**
     * @dev Stores all hashes in an append-only event log. Using events reduces gas cost dramatically.
     */
    event StoreHash(bytes32 hash);

    /**
     * @dev Stores the given hash as latest hash value.
     * @param hash value to store
     */
    function store(bytes32 hash) public {
        emit StoreHash(hash);
    }
}
