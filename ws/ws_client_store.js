// Copyright (c) 2014-2019, MyMonero.com
//
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of
//	conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list
//	of conditions and the following disclaimer in the documentation and/or other
//	materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors may be
//	used to endorse or promote products derived from this software without specific
//	prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
// THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
// STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
// THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

"use strict";
const assert = require('assert')
const JSBigInt = require("../mymonero-core-js/cryptonote_utils/biginteger").BigInteger;
const ws_parse_common = require('./ws_parse_common')

class Class
{
	constructor(args)
	{
		const self = this;
		{ // `this` state initialization from args
			const required_arg_names =
			[
			];
			for (var i = 0 ; i < required_arg_names.length ; i++) {
				const name = required_arg_names[i]
				const args_val = args[name];
				if (!args_val) {
					throw Error("Pass args." + name)
				} 
				self[name] = args_val;
			}
			{ // optl args or args set on 'this' with a different name (for now anyway)
				self.last_confirmed_tx_id_by_addr = args.optl_persisted__last_confirmed_tx_id_by_addr || {}
				self.last_confirmed_tx_block_hash_by_addr = args.optl_persisted__last_confirmed_tx_block_hash_by_addr || {}
				self.block_hash_by_confirmed_tx_id_by_addr = args.optl_persisted__block_hash_by_confirmed_tx_id_by_addr || {}
				//
				self.forgot_txs_cb = args.optl__forgot_txs_cb || function(tx_ids) {}
			}
		}
		self.addresses_by_unconfirmed_tx_hashes = {}
	}
	//
	// Interface - Accessors - Data to be saved for next instantiation so client can inform server of latest known persisted
	persistable__last_confirmed_tx_id_by_addr()
	{
		return this.last_confirmed_tx_id_by_addr
	}
	persistable__last_confirmed_tx_block_hash_by_addr()
	{
		return this.last_confirmed_tx_block_hash_by_addr
	}
	persistable__block_hash_by_confirmed_tx_id_by_addr()
	{
		return this.block_hash_by_confirmed_tx_id_by_addr
	}
	//
	// Accessors
	last_confirmed_tx_id_for_addr__orNull(address)
	{
		const v = this.last_confirmed_tx_id_by_addr[address]
		if (typeof v === 'undefined') {
			return null // undefined -> null
		}
		return v
	}
	last_confirmed_tx_block_hash_for_addr__orNull(address)
	{
		const v = this.last_confirmed_tx_block_hash_by_addr[address]
		if (typeof v === 'undefined') {
			return null // undefined -> null
		}
		return v
	}
	//
	// Delegation - Interface
	didReceive_wholeTx(tx)
	{
		const self = this
		if (typeof tx.hash === 'undefined' || !tx.hash) {
			throw Error("Expected tx.hash")
		}
		if (typeof tx.address === 'undefined' || !tx.address) {
			throw Error("Expected tx.address")
		}
		const tx_id = tx.id
		if (tx_id !== null && tx_id !== "" && typeof tx_id !== 'undefined') { // but it might be 0
			if (typeof tx.block_hash === 'undefined' || !tx.block_hash) {
				throw Error("Expected tx.block_hash on tx with id")
			}
			if (typeof tx.height === 'undefined' || tx.height === null || tx.height === "") {
				throw Error("Expected a string tx.height on tx with id")
			}
			//
			// must coerce ints into uint64-strings - and since this is (also) upon reception of obj, may as well do so in-place
			tx.height = ws_parse_common.string_from_uint64string(tx.height)
			//
			self._didReceive_confirmedTx(tx_id, tx.hash, tx.block_hash, tx.height, tx.address)
		} else {
			// tx has not been confirmed yet - wait for didReceive_txConfirmation, correlate local copy by tx.hash / tx_hash, then set local tx.id and tx.height, calculate state updates, and bubble up
			// meanwhile, store address for tx.hash for later lookup; gets deleted on confirmation
			self.addresses_by_unconfirmed_tx_hashes[tx.hash] = tx.address
		}
	}
	didReceive_confirmTx(tx_id, tx_hash, tx_block_height, tx_block_hash)
	{ // called this _confirmTx instead of _txConfirmation bc it shouldn't be confused with seeing any given confirmed tx (e.g. on a whole tx)
		const self = this
		const for_address = this.addresses_by_unconfirmed_tx_hashes[tx_hash]
		if (typeof for_address === 'undefined' || !for_address) {
			throw Error("Expected to have the tx object (which contained the address) for that tx_id")
		}
		delete self.addresses_by_unconfirmed_tx_hashes[tx_hash] // no longer needed
		//
		// update address last_confirmed_tx_id
		self._didReceive_confirmedTx(tx_id, tx_hash, tx_block_hash, tx_block_height, for_address);
	}
	didReceive_forget_txs(for_address, from_tx_id/*uint64-string*/)
	{
		const self = this
		var block_hashes_by_confirmed_tx_id = self.block_hash_by_confirmed_tx_id_by_addr[for_address]
		if (typeof block_hashes_by_confirmed_tx_id === 'undefined' || !block_hashes_by_confirmed_tx_id) {
			throw Error("Expected to have some txs on receiving a forget_txs")
		}
		const from_tx_id_JSBigInt = new JSBigInt(from_tx_id);
		const confirmed_tx_ids__strings = Object.keys(block_hashes_by_confirmed_tx_id)
		const n__confirmed_tx_ids = confirmed_tx_ids__strings.length
		if (n__confirmed_tx_ids == 0) {
			throw Error("Expected to have some confirmed txs on an address receiving a forget_txs")
		}
		var forget_txs_with_ids = []
		var last_tx_id_lte__from_tx_id = null
		for (var i = 0 ; i < n__confirmed_tx_ids ; i++) {
			const id_string = confirmed_tx_ids__strings[i]
			const id_JSBigInt = new JSBigInt(id_string);
			if (id_JSBigInt >= from_tx_id_JSBigInt) {
				delete self.block_hash_by_confirmed_tx_id_by_addr[for_address][id_string] // delete {} of tx_hashes for id_string
				forget_txs_with_ids.push(id_string)
			} else {
				last_tx_id_lte__from_tx_id = id_string // continuously overwrite
			}
		}
		if (forget_txs_with_ids.length == 0) {
			throw Error("Expected to have non-zero txs to forget on a forget_txs")
		}
		if (last_tx_id_lte__from_tx_id != null) {
			const block_hash = block_hashes_by_confirmed_tx_id[last_tx_id_lte__from_tx_id] // stored for us
			if (!block_hash || typeof block_hash === 'undefined') {
				throw Error("Expected to have a block hash for new last_confirmed_tx_id on a forget_txs")
			}
			self.last_confirmed_tx_id_by_addr[for_address] = last_tx_id_lte__from_tx_id
			self.last_confirmed_tx_block_hash_by_addr[for_address] = block_hash
		} else { // there are no confirmed tx left !!
			delete self.last_confirmed_tx_id_by_addr[for_address]
			delete self.last_confirmed_tx_block_hash_by_addr[for_address]
		}
		//

		// TODO: bubble up notification to forget txs with ids/hashes
	}
	//
	// Delegation - Internal
	_didReceive_confirmedTx(tx_id, tx_hash, tx_block_hash, tx_block_height, for_address)
	{
		const self = this
		if (tx_id === "" || tx_id === null || typeof tx_id === 'undefined')  {
			throw Error("Expected a tx id on a confirmed tx")
		}
		{ // always: store tx_hash by tx_id for re-derivation of latest confirmed hash
			var v = self.block_hash_by_confirmed_tx_id_by_addr[for_address]
			if (typeof v === 'undefined' || !v) {
				self.block_hash_by_confirmed_tx_id_by_addr[for_address] = {}
			}
			self.block_hash_by_confirmed_tx_id_by_addr[for_address][tx_id] = tx_block_hash 
		}
		//
		function __store_as_latest()
		{
			self.last_confirmed_tx_id_by_addr[for_address] = tx_id
			self.last_confirmed_tx_block_hash_by_addr[for_address] = tx_block_hash
		}
		{ // updating last_confirmed_tx_id for the address
			const existing = self.last_confirmed_tx_id_for_addr__orNull(for_address)
			if (existing === null || typeof existing === 'undefined') {
				__store_as_latest()
			} else {
				if ((new JSBigInt(existing)) < (new JSBigInt(tx_id))) { // TODO: can we compare like this or must we subtract and compare to 0?
					__store_as_latest()
				} else {
					console.log("[ws_client_store] Received a confirmed tx of an earlier tx id ('" + tx_id + "') than existing latest confirmed tx id ('" + existing + "') - not setting self.last_confirmed_tx_id for this addr")
				}
			}
		}
	}

}
//
module.exports = Class;