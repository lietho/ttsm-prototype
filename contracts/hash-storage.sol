// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Hash Storage
 * @dev Store & retrieve 256-bit hash values
 */
contract HashStorage {

    /**
     * @dev Read this public variable to retrieve the latest hash stored.
     */
    bytes32 public latestHash;

    /**
     * @dev Stores the given hash as latest hash value.
     * @param hash value to store
     */
    function store(bytes32 hash) public {
        latestHash = hash;
    }
}
