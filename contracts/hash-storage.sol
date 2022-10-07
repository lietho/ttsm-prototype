// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Hash Storage
 * @dev Store & retrieve hash values from an array
 */
contract HashStorage {

    bytes32[] hashes;

    /**
     * @dev Appends the given hash to the array.
     * @param hash value to store
     */
    function store(bytes32 hash) public {
        hashes.push(hash);
    }

    /**
     * @dev Return value
     * @return value of 'number'
     */
    function retrieve() public view returns (bytes32[] memory){
        return hashes;
    }
}
