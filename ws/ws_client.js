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

const ws_wireformat = require('./ws_wireformat')
const WSOperation = ws_wireformat.WSOperation
const WSResponseType = ws_wireformat.WSResponseType

const ws_parse_common = require('./ws_parse_common')

class Class
{
	constructor(args)
	{
		const self = this;
		{ // `this` state initialization from args
			const required_arg_names =
			[
				"ws_transport",
				"block_info_cb",
				"subscr_initial_info_cb",
				"subscr_initial_backlog_txs_cb",
				"subscr_initial_error_cb",
				"anonymous_error_cb",
				"unsubscribed_cb",
				"unsubscr_error_cb",
				"postinitial_tx_cb",
				"forget_txs_cb",
				"wallet_status_cb",
				"confirm_tx_cb"
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
				self.store = new (require('./ws_client_store'))({ // TODO: allow injection of type
					optl_persisted__last_confirmed_tx_id_by_addr: args.optl_persisted__last_confirmed_tx_id_by_addr,
					optl_persisted__last_confirmed_tx_block_hash_by_addr: args.optl_persisted__last_confirmed_tx_block_hash_by_addr,
					optl_persisted__tx_hash_by_confirmed_tx_id_by_addr: args.optl_persisted__tx_hash_by_confirmed_tx_id_by_addr,
					optl__forgot_txs_cb: args.optl__store_did_forget_txs_cb
				});
			}
		}
		{ // `this` state init - runtime
			self._isReqIdForOp__subscribe = {} // gets removed on: type:txs_initial_info,error
			self._isReqIdForOp__unsubscribe = {} // gets removed on: type:unsubscribed,error
			//
			self._activeStateFor_subscrInitPhase_by_feedId = {} // gets removed when subscription initial phase over
		}
	}
	//
	// Accessors - Factories - UIDs
	__new_semirandom_id()
	{
		return Math.random().toString(36).substr(2, 9); // doesn't have to be super random
	}
	__new_req_id()
	{
		return this.__new_semirandom_id()
	}
	//
	// Interface - Accessors - Data to be saved for next instantiation so client can inform server of latest known persisted
	persistable__last_confirmed_tx_id_by_addr() 
	{
		return this.store.persistable__last_confirmed_tx_id_by_addr()
	}
	persistable__last_confirmed_tx_block_hash_for_addr()
	{
		return this.store.persistable__last_confirmed_tx_block_hash_for_addr()
	}
	//
	// Imperatives/Accessors - Operation state tracking to identify callback types 
	__storeReqIdFor_subscribe(req_id) { this._isReqIdForOp__subscribe[req_id] = true }
	__storeReqIdFor_unsubscribe(req_id) { this._isReqIdForOp__unsubscribe[req_id] = true }
	//
	__deleteReqIdFor_subscribe(req_id) { delete this._isReqIdForOp__subscribe[req_id] }
	__deleteReqIdFor_unsubscribe(req_id) { delete this._isReqIdForOp__unsubscribe[req_id] }
	//
	__isFor_subscribe(req_id) { return this._isReqIdForOp__subscribe[req_id] === true }
	__isFor_unsubscribe(req_id) { return this._isReqIdForOp__unsubscribe[req_id] === true }
	//
	___assert_noActiveSubscrInitPhaseForWSId(feed_id, res_type)
	{
		const self = this
		const s = self._activeStateFor_subscrInitPhase_by_feedId[feed_id]
		if (typeof s !== 'undefined' || s) {
			throw "Unexpected active state for subscr init phase for feed id " + feed_id + " for res.type " + res_type
		}
	}
	//
	_handleRes__stateless(feed_id, res) 
	{ // -> did_handle: Bool?
		const self = this
		const req_id__orNull = typeof res.req_id === 'undefined' || !res.req_id ? null : res.req_id
		if (res.type == WSResponseType.error) { // first, regardless of whether handling a response to a subscription, if an error is received, bubble it up - because if an error is issued immediately after a subscription but before ws_client gets txs_initial_info, it won't know it's in a subscription's initial-phase state anyway
			// console.log("Got response of type " + WSResponseType.error + " with payload: " + JSON.stringify(res));
			if (req_id__orNull != null) {
				// do not assert that no active state for feed_id because if we have a req_id then we'd expect an active state
				const req_id = req_id__orNull//!
				if (self.__isFor_subscribe(req_id)) {
					self.__deleteReqIdFor_subscribe(req_id) // an error end of that req_id's lifespan
					self.subscr_initial_error_cb(feed_id, req_id, res.code, res.Error)
					// allow fall-through to true return
				} else if (self.__isFor_unsubscribe(req_id)) {
					self.__deleteReqIdFor_unsubscribe(req_id) // an error end of that req_id's lifespan
					self.unsubscr_error_cb(feed_id, req_id, res.code, res.Error)
					// allow fall-through to true return
				} else {
					throw Error("Unhandled req_id categorization in res.type " + WSResponseType.error)
				}
			} else {
				self.___assert_noActiveSubscrInitPhaseForWSId(feed_id, res.type);
				self.anonymous_error_cb(feed_id, res.code, res.Error)
			}
			return true // did_handle
		}
		if (res.type == WSResponseType.unsubscribed) {
			self.___assert_noActiveSubscrInitPhaseForWSId(feed_id, res.type);
			if (req_id__orNull != null) {
				const req_id = req_id__orNull
				if (!self.__isFor_unsubscribe(req_id)) {
					throw Error("Expected __isFor_unsubscribe(req_id)")
				}
				self.__deleteReqIdFor_unsubscribe(req_id) // this is the success response that marks the end of that req_id's lifespan
			}
			self.unsubscribed_cb(feed_id, req_id__orNull)
			//
			return true // did_handle
		}
		if (res.type == WSResponseType.block_info) {
			self.___assert_noActiveSubscrInitPhaseForWSId(feed_id, res.type);
			if (!res.block) {
				throw Error("Expected res.block on type " + res.type)
			}
			if (res.block.height == null || res.block.height === "" || typeof res.block.height === 'undefined') {
				throw Error("Expected a uint64-string res.block.height on type " + res.type)
			}
			//
			// must coerce ints into uint64-strings - and since this is upon reception of obj, may as well do so in-place
			res.block.height = ws_parse_common.string_from_uint64string(res.block.height)
			if (typeof res.block.head_tx_id != 'undefined') {
				res.block.head_tx_id = ws_parse_common.string_from_uint64string(res.block.head_tx_id)
			}
			res.block.per_byte_fee = ws_parse_common.string_from_uint64string(res.block.per_byte_fee)
			res.block.fee_mask = ws_parse_common.string_from_uint64string(res.block.fee_mask)
			//
			self.block_info_cb(
				feed_id,
				res.block.height, 
				res.block.block_hash,
				res.block.head_tx_id, 
				res.block.per_byte_fee, 
				res.block.fee_mask
			)
			//
			return true // did_handle
		}
		if (res.type == WSResponseType.forget_txs) {
			self.___assert_noActiveSubscrInitPhaseForWSId(feed_id, res.type);
			if (res.address === "" || res.address === null || typeof res.address === 'undefined')  {
				throw Error("Expected a res.address on type " + res.type)
			}
			if (res.from_tx_id === "" || res.from_tx_id === null || typeof res.from_tx_id === 'undefined')  {
				throw Error("Expected a uint64-string res.from_tx_id on type " + res.type)
			}
			//
			res.from_tx_id = ws_parse_common.string_from_uint64string(res.from_tx_id)
			//
			self.store.didReceive_forget_txs(res.address, res.from_tx_id)
			self.forget_txs_cb(feed_id, res.address, res.from_tx_id)
			//
			return true // did_handle
		}
		if (res.type == WSResponseType.wallet_status) {
			// TODO: possibly assert here that res.address is within set of current active subscriptions - but that'd require the storage of those addresses as well as some (non-existent) way to track that all unsubscribes have actually removed all possible subscription-query-components from any active subscriptions which were issued
			self.___assert_noActiveSubscrInitPhaseForWSId(feed_id, res.type);
			if (res.address === "" || res.address === null || typeof res.address === 'undefined')  {
				throw Error("Expected a res.address on type " + res.type)
			}
			if (res.scan_block_height === "" || res.scan_block_height === null || typeof res.scan_block_height === 'undefined')  {
				throw Error("Expected a uint64-string res.scan_block_height on type " + res.type)
			}
			//
			// must coerce ints into uint64-strings - and since this is upon reception of obj, may as well do so in-place
			res.scan_block_height = ws_parse_common.string_from_uint64string(res.scan_block_height)
			//
			self.wallet_status_cb(feed_id, res.address, res.scan_block_height)
			//
			return true // did_handle
		}
		if (res.type == WSResponseType.confirm_tx) {
			self.___assert_noActiveSubscrInitPhaseForWSId(feed_id, res.type);
			if (!res.tx) {
				throw Error("Expected res.tx on type " + res.type)
			}
			if (res.tx.id === "" || res.tx.id === null || typeof res.tx.id === 'undefined')  {
				throw Error("Expected a uint64-string res.tx.id on type " + res.type) // because it's confirmed, it has an id
			}
			//
			// must coerce ints into uint64-strings - and since this is upon reception of obj, may as well do so in-place
			res.tx.id = ws_parse_common.string_from_uint64string(res.tx.id)
			//
			self.store.didReceive_confirmTx(res.tx.id, res.tx.hash, res.tx.height, res.tx.block_hash)
			self.confirm_tx_cb(feed_id, res.tx.id, res.tx.hash, res.tx.height)
			//
			return true // did_handle
		}
		//
		return false // did_handle
	}
	_handleRes__subscriptionInitialState(feed_id, res)
	{
		const self = this
		const req_id__orNull = typeof res.req_id === 'undefined' || !res.req_id ? null : res.req_id
		const preExistingWSState = self._activeStateFor_subscrInitPhase_by_feedId[feed_id];
		if (res.type == WSResponseType.txs_initial_info) {
			if (typeof preExistingWSState !== 'undefined' || preExistingWSState != null) {
				throw Error("Didn't exist preExistingWSState on res.type=.txs_initial_info")
			}
			if (res.expect_backlog_txs <= 0) { // don't enter the initial-phase state if no txs expected - because otherwise, we'd never exit that state!! (or we'd have to have code to do so - but it would happen 'instantaneously' here anyway)
				if (req_id__orNull) { 
					const req_id = req_id__orNull//!
					self.__deleteReqIdFor_subscribe(req_id) // since that phase is over
				}
				console.log("[ws_client] No backlog txs to receive for (optl) req_id " + req_id__orNull);
				delete self._activeStateFor_subscrInitPhase_by_feedId[feed_id]; // not that we'd be in that state - but to be clear
			} else {
				self._activeStateFor_subscrInitPhase_by_feedId[feed_id] =
				{
					optl__req_id: res.req_id, // if it exists
					expect_backlog_txs: res.expect_backlog_txs,
					received_backlog_txs: 0
				};
			}
			self.subscr_initial_info_cb(
				feed_id,
				req_id__orNull,
				res.expect_backlog_txs // making sure not to return null
			);
			return true // did_handle
		}
		if (typeof preExistingWSState !== 'undefined' && preExistingWSState) { // this means we're within the initial management phase for a subscription w non-zero initial (backlog) txs
			if (res.type == WSResponseType.tx) {
				if (preExistingWSState.expect_backlog_txs === 0) {
					throw Error("Expected preExistingWSState.expect_backlog_txs != 0")
				}
				if (preExistingWSState.received_backlog_txs == null) {
					throw Error("Didn't expect null preExistingWSState.received_backlog_txs")
				}
				preExistingWSState.received_backlog_txs += 1;
				if (!res.tx) {
					throw Error("Expected res.tx on type " + res.type)
				}
				self.store.didReceive_wholeTx(res.tx) // This must get called for the proper mgmt of internal state
				self.subscr_initial_backlog_txs_cb(
					feed_id,
					preExistingWSState.optl__req_id,
					res.tx
				)
				// clean up state
				if (preExistingWSState.expect_backlog_txs == preExistingWSState.received_backlog_txs) {
					// received all remaining initial txs... we can clear the various state vars here
					console.log("[ws_client] Finished receiving backlog txs for (optl) req_id " + preExistingWSState.optl__req_id);
					if (preExistingWSState.optl__req_id) {
						const state__req_id = preExistingWSState.optl__req_id;//!
						self.__deleteReqIdFor_subscribe(state__req_id); // no longer needed
					}
					delete self._activeStateFor_subscrInitPhase_by_feedId[feed_id]; // zero this for future detection of the initial-phase state existence
				}
				return true // did handle
			} else {
				throw Error("Invalid response type for initial subscription messages phase")
			}
		}
		return false
	}
	//
	connect(feed_channel, optl__cb, optl__ws_error_cb, optl__disconnected_cb) // -> feed_id
	{
		const self = this
		const cb = optl__cb ? optl__cb : function() {}
		const ws_error_cb = optl__ws_error_cb ? optl__ws_error_cb : function(err) {}
		const disconnected_cb = optl__disconnected_cb ? optl__disconnected_cb : function() {}
		//
		const feed_id = self.ws_transport.new_feed_id(); // for local state accounting
		self.ws_transport.connect_feed({
			feed_id: feed_id,
			feed_channel: feed_channel, // feed_channel ensures the connection being opened is going to the necessary back-end channel and is placed on the websocket URI as a querty parameter
			error_fn: function(err)
			{
				ws_error_cb(err)
			},
			connect_fn: function()
			{
				cb();
			},
			disconnected_fn: function()
			{
				disconnected_cb()
			},
			on_message_fn: function(res)
			{
				// console.log("[ws_client] Received message:", res)
				var did_handle = false;
				did_handle = self._handleRes__stateless(feed_id, res); // .block_info, .unsubscribed, .error
				if (did_handle) {
					return // handled; bail
				}
				if (res.type == WSResponseType.block_info 
					|| res.type == WSResponseType.unsubscribed 
					|| res.type == WSResponseType.error
					|| res.type == WSResponseType.forget_txs
					|| res.type == WSResponseType.wallet_status
					|| res.type == WSResponseType.confirm_tx) {
					throw Error("Unexpected stateless res.type " + res.type)
				}
				did_handle = self._handleRes__subscriptionInitialState(feed_id, res);
				if (did_handle) {
					return // handled; bail
				}
				if (res.type == WSResponseType.txs_initial_info) {
					throw Error("Unexpected res.type of " + res.type)
				}
				if (res.type == WSResponseType.tx) {
					self.store.didReceive_wholeTx(res.tx) // This must get called for the proper mgmt of internal state
					self.postinitial_tx_cb(
						feed_id,
						res.tx
					)
					return // handled; bail
				}
				throw Error("Unhandled res.type " + res.type)
			}
		});
		return feed_id;
	}
	disconnect_feed(feed_id)
	{
		const self = this
		self.ws_transport.disconnect_feed(feed_id)
	}
	//
	// Accessors - Interface - Subscriptions
	new_subscribe_payload(args)
	{ // -> req_id
		const self = this;
		if (!args.address) {
			throw Error("args.address required")
		}
		if (!args.view_key) {
			throw Error("args.view_key required")
		}
		const payload =
		{
			op: WSOperation.subscribe_txs,
			req_id: self.__new_req_id(),
			address: args.address,
			view_key: args.view_key
		};
		{
			const since_confirmed_tx_id = self.store.last_confirmed_tx_id_for_addr__orNull(args.address)
			const since_block_hash = self.store.last_confirmed_tx_block_hash_for_addr__orNull(args.address)
			if (since_confirmed_tx_id) {
				console.log("[ws_client] Setting since_confirmed_tx_id of '" + since_confirmed_tx_id + "'")
				payload.since_confirmed_tx_id = since_confirmed_tx_id;
				if (!since_block_hash) {
					throw Error("[ws_client] Expected since_block_hash from store given non-nil since_confirmed_tx_id")
				}
				console.log("[ws_client] Setting since_block_hash of '" + since_block_hash + "'")
				payload.since_block_hash = since_block_hash;
			} else {
				if (since_block_hash) {
					throw Error("[ws_client] Expected nil since_block_hash from store given nil since_confirmed_tx_id")
				}
			}
		}
		self._common_placeArgValsIntoPayload(
			args, payload, 
			[ "payment_ids", "subaddresses", "since_block_hash" ]
		);
		return payload;
	}
	new_unsubscribe_payload(args)
	{ // -> req_id
		const self = this;
		if (!args.address) {
			throw Error("args.address required")
		}
		const payload =
		{
			op: WSOperation.unsubscribe_txs,
			req_id: self.__new_req_id(),
			address: args.address
		};
		self._common_placeArgValsIntoPayload(
			args, payload, 
			[ "payment_ids", "subaddresses" ]
		);
		return payload;
	}
	//
	// Imperatives - Interface - Shared
	send_payload__feed(feed_id, payload)
	{
		const self = this;
		console.log("[ws_client] Send payload" , payload)
		if (payload.req_id) { // actually optl
			const req_id = payload.req_id
			// Assuming that a 'send_payload' is the best place to store these…  but it's probably not optimal because there are probably edge cases where ws_client wouldn't get notified to delete the req_id, e.g. on a transport failure … but errors on the transport may be bubbled up
			if (typeof payload.op === 'undefined' || payload.op == null || payload.op === "") {
				throw Error("Expected payload.op")
			}
			if (payload.op == WSOperation.subscribe_txs) {
				self.__storeReqIdFor_subscribe(req_id)
			} else if (payload.op == WSOperation.unsubscribe_txs) {
				self.__storeReqIdFor_unsubscribe(req_id)
			} else {
				throw Error("[ws_client/send_payload] Unhandled payload 'op' " + payload.op + "")
			}
		}
		self.ws_transport.send_on_feed(feed_id, payload) // TODO: once WS support has been added: if this returns an error, unstore the req_id 
	}
	//
	// Pure Mutators - Shared
	_common_placeArgValsIntoPayload(args, payload, fieldNames__optls)
	{
		const fieldNames__optls_length = fieldNames__optls.length
		for (var i = 0 ; i < fieldNames__optls_length ; i++) {
			const v = args[fieldNames__optls[i]]
			if (v) {
				payload[fieldNames__optls[i]] = v
			}
		}
	}
}
//
module.exports = Class;