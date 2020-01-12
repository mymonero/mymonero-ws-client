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
const ws_transport__base = require('../ws/ws_transport__base')
//
const ws_wireformat = require('../ws/ws_wireformat')
const WSOperation = ws_wireformat.WSOperation
const WSResponseType = ws_wireformat.WSResponseType
const WSErrorCode = ws_wireformat.WSErrorCode
//
class Class extends ws_transport__base
{
	constructor(args)
	{
		super(args)
		//
	}
	//
	connect_feed(args)
	{
		const self = this
		if (!args.connect_fn) {
			throw "Pass args.connect_fn" // make bad args obvious
		}
		if (!args.on_message_fn) {
			throw "Pass args.on_message_fn" // make bad args obvious
		}
		if (self.isConnected__feed) {
			args.connect_fn("Already connected")
			return
		}
		{
			// self.ws = new WebSocket('ws://api.mymonero.com:8443/feed');
			// self.ws.on('open', function() { self.isConnected__feed = true; args.connect_fn() });
			// self.ws.on('message', args.on_message_fn);
		}
		{ // mock connect			
			self.isConnected__feed = true
			args.connect_fn()
			self._feed_mockStashed_on_message_fn = args.on_message_fn; // for later
			self._enterRunloop__mockedSends()
		}
	}
	disconnect_feed(feed_id)
	{
		throw Error("TODO: implement disconnect feed")
	}
	send_on_feed(feed_id, params)
	{
		const self = this
		{ // ordinarily
			// ws.send(params)
		}
		{ // mock handling:
			const op = params.op
			if (op == WSOperation.subscribe_txs) { // TODO: reference same constants file as ws_client for this
				const req_id = params.req_id
				// const since_confirmed_tx_id = params.since_confirmed_tx_id // unused
				if (!req_id || typeof req_id === 'undefined') {
					throw "Expected a req_id in a "
				}
				if (!self._mockTransportState_has_subscription1_added) { // then this must be that subscription
					self._mockTransportState_has_subscription1_added = true // immediately set
					self._feed_mockStashed_subscription1_req_id = req_id
					console.log("Subscribe1 txs params", params)
					self._feed_mockStashed_subscription1_address = params.address
					return
				}
				if (!self._mockTransportState_has_subscription2_added) { // then this must be that subscription
					self._mockTransportState_has_subscription2_added = true // immediately set
					self._feed_mockStashed_subscription2_req_id = req_id
					return
				}
				if (!self._mockTransportState_has_subscription3_added) { // then this must be that subscription
					self._mockTransportState_has_subscription3_added = true // immediately set
					self._feed_mockStashed_subscription3_req_id = req_id
					return
				}
				throw Error("Only expected three subscriptions for now");
			} else if (op == WSOperation.unsubscribe_txs) {
				const req_id = params.req_id
				// const since_confirmed_tx_id = params.since_confirmed_tx_id // unused
				if (!req_id || typeof req_id === 'undefined') {
					throw "Expected a req_id in a "
				}
				if (!self._mockTransportState_has_unsubscribe1_added) { // then this must be that unsubscribe
					self._mockTransportState_has_unsubscribe1_added = true // immediately set
					self._feed_mockStashed_unsubscribe1_req_id = req_id
					return
				}
				if (!self._mockTransportState_has_unsubscribe2_added) { // then this must be that unsubscribe
					self._mockTransportState_has_unsubscribe2_added = true // immediately set
					self._feed_mockStashed_unsubscribe2_req_id = req_id
					return
				}
			} else {
				throw Error("TODO? Unhandled op '" + op + "' in ws_transport__server_mock/send")
			}
		}
	}
	_enterRunloop__mockedSends()
	{
		const self = this
		self.__runloop_mockedSends_performSequences()
	}
	__runloop_mockedSends_performSequences()
	{
		const self = this
		if (self._mockTransportState_has_subscription1_added) {
			if (self._mockTransportState_has_subscription1_sentReply_batch1 != true) {
				self._mockTransportState_has_subscription1_sentReply_batch1 = true; // immediately set this so we never do it again in the middle of the routine
				self.__mockTransport_subscription1_sendReply_batch1();
				self.___re_enterRunloop__mockedSends()
				return; // bail and wait for next interval
			}
		}
		if (self._mockTransportState_has_subscription2_added) {
			if (self._mockTransportState_has_subscription2_sentReply_batch1 != true) {
				self._mockTransportState_has_subscription2_sentReply_batch1 = true;
				self.__mockTransport_subscription2_sendReply_batch1();
				self.___re_enterRunloop__mockedSends()
				return;
			}
		}
		if (self._mockTransportState_has_subscription3_added) {
			if (self._mockTransportState_has_subscription3_sentReply_batch1 != true) {
				self._mockTransportState_has_subscription3_sentReply_batch1 = true;
				self.__mockTransport_subscription3_sendReply_batch1();
				self.___re_enterRunloop__mockedSends()
				return;
			}
		}
		if (self._mockTransportState_has_unsubscribe1_added) {
			if (self._mockTransportState_has_unsubscribe1_sentReply_batch1 != true) {
				self._mockTransportState_has_unsubscribe1_sentReply_batch1 = true;
				self.__mockTransport_unsubscribe1_sendReply_batch1();
				self.___re_enterRunloop__mockedSends()
				return;
			}
		}
		if (self._mockTransportState_has_unsubscribe2_added) {
			if (self._mockTransportState_has_unsubscribe2_sentReply_batch1 != true) {
				self._mockTransportState_has_unsubscribe2_sentReply_batch1 = true;
				self.__mockTransport_unsubscribe2_sendReply_batch1();
				self.___re_enterRunloop__mockedSends()
				return;
			}
		}
		//
		if (self._mockTransportState_has_unsubscribe2_added) { // whatever the last one is
			if (self._mockTransportState_hasSent_postInitialSubscr_stateless != true) {
				self._mockTransportState_hasSent_postInitialSubscr_stateless = true;
				self.__mockTransport_postInitialSubscriptions_stateless_sequence1();
				return;
			}
			console.log("[ws_transport__server_mock] No other mocked sequences to perform… exiting runloop.")
			return;
		}
		// otherwise re-enter and wait for the remainder of the requests to be sent, and handle their mocked replies
		self.___re_enterRunloop__mockedSends()
	}
	___re_enterRunloop__mockedSends()
	{
		const self = this
		setTimeout(function()
		{
			self._enterRunloop__mockedSends()
		}, 100) // every T ms
	}
	__shared_send_mocked_txs(N_txs)
	{
		const self = this;
		for (var i = 0 ; i < N_txs ; i++) {
			const this_res =
			{
				type: WSResponseType.tx,
				tx: {
					id: `${i}`, // string
					unlock_time: `${(self._mocked_current_blockchain_height + 10)}`,
					address: self._feed_mockStashed_subscription1_address,
					hash: "123123-"+i,
					block_hash: "initialsubscrs",
					height: `${self._mocked_current_blockchain_height}` // string
				}
			};
			setTimeout(function() {
				self._feed_mockStashed_on_message_fn(this_res)
			}, 50*i)
		}
	}
	__mockTransport_subscription1_sendReply_batch1()
	{
		const self = this
		// commented even tho useful bc this state var is not strictly in the domain of this function 
		// if (self._mockTransportState_has_subscription1_sentReply_batch1 != true) {
		// 	throw "Expected true self._mockTransportState_has_subscription1_sentReply_batch1 to lock out calling this"
		// }
		if (!self._feed_mockStashed_subscription1_req_id || typeof self._feed_mockStashed_subscription1_req_id == 'undefined') {
			throw "Expected self._feed_mockStashed_subscription1_req_id"
		}
		self._mocked_current_blockchain_height = 0 
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.block_info, // the initial message, for now
			block: {
				height: `${self._mocked_current_blockchain_height}`,
				block_hash: "a block hash",
				per_byte_fee: "321321",
				fee_mask: "123123"
			}
		});
		const N_txs = 3
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.txs_initial_info,
			req_id: self._feed_mockStashed_subscription1_req_id,
			expect_backlog_txs: N_txs
		});
		self.__shared_send_mocked_txs(N_txs);
	}
	__mockTransport_subscription2_sendReply_batch1()
	{
		const self = this
		if (!self._feed_mockStashed_subscription2_req_id || typeof self._feed_mockStashed_subscription2_req_id == 'undefined') {
			throw "Expected self._feed_mockStashed_subscription2_req_id"
		}
		self._mocked_current_blockchain_height += 13
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.block_info,
			block: {
				height: `${self._mocked_current_blockchain_height}`,
				block_hash: "another block hash",
				per_byte_fee: "321321",
				fee_mask: "123123"
			}
		});
		const N_txs = 0
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.txs_initial_info,
			req_id: self._feed_mockStashed_subscription2_req_id,
			expect_backlog_txs: N_txs
		});
	}
	__mockTransport_subscription3_sendReply_batch1()
	{
		const self = this
		if (!self._feed_mockStashed_subscription3_req_id || typeof self._feed_mockStashed_subscription3_req_id == 'undefined') {
			throw "Expected self._feed_mockStashed_subscription3_req_id"
		}
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.error,
			req_id: self._feed_mockStashed_subscription3_req_id,
			code: WSErrorCode.badRequest,
			Error: "Invalid field value for 'subaddress'"
		});
	}
	//
	__mockTransport_unsubscribe1_sendReply_batch1()
	{
		const self = this
		if (!self._feed_mockStashed_unsubscribe1_req_id || typeof self._feed_mockStashed_unsubscribe1_req_id == 'undefined') {
			throw "Expected self._feed_mockStashed_unsubscribe1_req_id"
		}
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.unsubscribed,
			req_id: self._feed_mockStashed_unsubscribe1_req_id
		});
	}
	__mockTransport_unsubscribe2_sendReply_batch1()
	{
		const self = this
		if (!self._feed_mockStashed_unsubscribe2_req_id || typeof self._feed_mockStashed_unsubscribe2_req_id == 'undefined') {
			throw "Expected self._feed_mockStashed_unsubscribe2_req_id"
		}
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.error,
			req_id: self._feed_mockStashed_unsubscribe2_req_id,
			code: WSErrorCode.badRequest,
			Error: "Invalid field value for 'subaddress'"
		});
	}
	__mockTransport_postInitialSubscriptions_stateless_sequence1()
	{
		const self = this
		//
		var i = 150 
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.tx,
			tx: {
				id: `${i}`,
				hash: "123123-a",
				address: self._feed_mockStashed_subscription1_address,
				unlock_time: `${self._mocked_current_blockchain_height + 10}`,
				block_hash: "prereorg",
				height: `${self._mocked_current_blockchain_height}`
			}
		});
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.tx,
			tx: {
				id: `${i+1}`,
				hash: "123123-b",
				address: self._feed_mockStashed_subscription1_address,
				unlock_time: `${self._mocked_current_blockchain_height + 11}`,
				block_hash: "prereorg",
				height: `${self._mocked_current_blockchain_height}`
			}
		});
		//
		self._mocked_current_blockchain_height -= 7 // simulate rollback (some portion of the simulated increment)
		//
		self._feed_mockStashed_on_message_fn({
			type: WSResponseType.forget_txs,
			address: self._feed_mockStashed_subscription1_address,
			from_tx_id: `${i}`
		})
		setTimeout(function()
		{
			self._feed_mockStashed_on_message_fn({
				type: WSResponseType.wallet_status,
				address: self._feed_mockStashed_subscription1_address,
				scan_block_height: `${self._mocked_current_blockchain_height - 3}`
			})
			//
			// rebroadcasting those txs after 'reorg'
			self._feed_mockStashed_on_message_fn({
				type: WSResponseType.tx,
				tx: {
					id: `${i}`,
					hash: "123123-a",
					address: self._feed_mockStashed_subscription1_address,
					unlock_time: `${self._mocked_current_blockchain_height + 10}`,
					block_hash: "postreorg",
					height: `${self._mocked_current_blockchain_height}`
				}
			});
			self._feed_mockStashed_on_message_fn({
				type: WSResponseType.tx,
				tx: {
					id: `${i+1}`,
					hash: "123123-b",
					address: self._feed_mockStashed_subscription1_address,
					unlock_time: `${self._mocked_current_blockchain_height + 11}`,
					block_hash: "postreorg",
					height: `${self._mocked_current_blockchain_height}`
				}
			});
			self._feed_mockStashed_on_message_fn({
				type: WSResponseType.tx,
				tx: {
					hash: "123123-mempool",
					address: self._feed_mockStashed_subscription1_address,
					unlock_time: `${self._mocked_current_blockchain_height + 11}`
				}
			});
			//
			self._feed_mockStashed_on_message_fn({
				type: WSResponseType.confirm_tx,
				tx: {
					id: `${i+2}`,
					hash: "123123-mempool",
					height: `${self._mocked_current_blockchain_height}`,
					block_hash: "postreorg"
				}
			})
		}, 50)
	}
	//
	//
}
//
module.exports = Class;