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
//
var use_real_transport = false // configurable by test runner
//
"use strict";
const mymonero = require("../mymonero-core-js/");
const monero_config = require('../mymonero-core-js/monero_utils/monero_config') 
const assert = require('assert')
//
const ws_wireformat = require('../ws/ws_wireformat')
const WSErrorCode = ws_wireformat.WSErrorCode
//
var hasReceivedA_block_info = false; // Respective "​block_info" responses are guaranteed to be sent and received before any Transactions found in those blocks.
var lastReceived_block_height = null;
//
var first__req_id = null;
var first__expectingNTxs = use_real_transport ? 1320 : 3; // defined in ws_transport__server_mock
var first__gotNTxs = 0;
var first__done_fn = null;
//
var second__req_id = null;
var second__expectingNTxs = 0; // defined in ws_transport__server_mock
var second__done_fn = null;
//
var third__req_id = null;
var third__done_fn = null;
//
var fourth__req_id = null;
var fourth__done_fn = null;
//
var fifth__req_id = null;
var fifth__done_fn = null;
//
var sawForgetTxsCbWith_addresses = []
var sawForgetTxsCbWith_fromTxIds = []
var sawWalletStatusCbWith_addresses = []
var sawWalletStatusCbWith_scannedBlockHeights = []
var sawConfirmTxCbWith_tx_ids = []
//
const this_test_transport_path = use_real_transport ? "../ws/ws_transport.real" : "./ws_transport.server_mock" 
const ws_transport = new (require(this_test_transport_path))({
	ws_url_base: "ws://localhost:8888" // 'ws://api.mymonero.com:8091' // also the default for ws_transport.real.js
});
//
const client = new (require('../ws/ws_client'))({
	ws_transport: ws_transport,

	// optl_persisted__last_confirmed_tx_id_by_addr,
    // optl_persisted__last_confirmed_tx_block_hash_by_addr,
    // optl_persisted__tx_hash_by_confirmed_tx_id_by_addr


	block_info_cb: function(feed_id, block_height, block_hash, head_tx_id, per_byte_fee, fee_mask)
	{
		hasReceivedA_block_info = true
		lastReceived_block_height = block_height
	},
	subscr_initial_info_cb: function(feed_id, optl__req_id, expect_backlog_txs)
	{
		assert.equal(hasReceivedA_block_info, true);
		assert.notEqual(first__req_id, null);
		if (optl__req_id) {
			const req_id = optl__req_id
			if (req_id == first__req_id) {
				assert.equal(expect_backlog_txs, first__expectingNTxs)
				return;
			}
			assert.notEqual(second__req_id, null);
			if (req_id == second__req_id) {
				assert.equal(expect_backlog_txs, second__expectingNTxs)
				assert.equal(second__expectingNTxs, 0)
				assert.notEqual(null, second__done_fn);
				second__done_fn();
				return;
			}
			assert.notEqual(third__req_id, null);
			assert.notEqual(req_id, third__req_id); // because we never expect to see this for the third subscription, which is only to error
			throw "Unexpected req_id";
		}
	},
	subscr_initial_backlog_txs_cb: function(feed_id, optl__req_id, tx)
	{
		assert.equal(hasReceivedA_block_info, true);
		assert.notEqual(lastReceived_block_height, null);
		assert.notEqual(first__req_id, null);
		// ^-- "The server may send duplicates of transactions; client implementations should always overwrite locally stored transactions where applicable."
		if (optl__req_id) {
			const req_id = optl__req_id
			if (req_id == first__req_id) {
				first__gotNTxs += 1;
				{ // Any testing desired on received subscription-A txs:
					const reason = mymonero.monero_txParsing_utils.TransactionLockedReason(tx, lastReceived_block_height)
					assert.equal(0, reason.indexOf("Will be unlocked in"))
					assert.notEqual(-1, reason.indexOf("10 minutes"))
				}
				if (first__gotNTxs == first__expectingNTxs) {
					assert.notEqual(null, first__done_fn);
					first__done_fn() // assume success here
				}
				return;
			}
			assert.notEqual(second__req_id, null);
			if (req_id == second__req_id) {
				throw Error("Did not expect any txs in initial backlog for subscription2")
			}
			assert.notEqual(third__req_id, null);
			assert.notEqual(req_id, third__req_id); // because we never expect to see this for the third subscription, which is only to error
			throw Error("Unexpected req_id");
		}
		throw Error("Unhandled nil req_id in subscr_initial_backlog_txs_cb")
	},
	subscr_initial_error_cb: function(feed_id, req_id, err_code, err_msg)
	{
		assert.notEqual(req_id, null); // because otherwise it'd be anonymous
		if (req_id == third__req_id) {
			assert.notEqual(third__req_id, null);
			assert.equal(err_code, WSErrorCode.badRequest);
			assert.equal(err_msg, "Invalid field value for 'subaddress'");
			third__done_fn(); // because we expect the third to throw an error 
			return
		}
		// last explicits about req_id 
		assert.notEqual(third__req_id, req_id); // because we've already handled this
		//
		// Even though we don't expect errors here for most subscrs, rather than just asserting that the req_id is not those subscrs, throw the error so the test framework can see it
		throw Error("[ws.spec/subscr_initial_error_cb] Got unexpected error code " + err_code + " and err_msg '" + err_msg + "'' on req_id " + req_id); 
	},
	unsubscribed_cb: function(feed_id, optl__req_id)
	{
		if (optl__req_id) {
			const req_id = optl__req_id
			if (req_id == fourth__req_id) {
				assert.notEqual(fourth__req_id, null);
				fourth__done_fn(); // because we expect the third to throw an error 
				return
			}
			throw Error("[ws.spec/unsubscribed_cb] Unhandled req_id " + req_id); 
		}
		console.log("[ws.spec/unsubscribed_cb] Unsubscribed with nil req_id")
	},
	unsubscr_error_cb: function(feed_id, req_id, err_code, err_msg)
	{
		assert.notEqual(req_id, null); // because otherwise it'd be anonymous
		if (req_id == fifth__req_id) {
			assert.notEqual(fifth__req_id, null);
			assert.equal(err_code, WSErrorCode.badRequest);
			assert.equal(err_msg, "Invalid field value for 'subaddress'");
			fifth__done_fn(); // because we expect the third to throw an error 
			return
		}
		// last explicits about req_id 
		assert.notEqual(fifth__req_id, req_id); // because we've already handled this
		//
		throw Error("[ws.spec/unsubscr_error_cb] Got unexpected error code " + err_code + " and err_msg '" + err_msg + "'' on req_id " + req_id); 
	},
	postinitial_tx_cb: function(feed_id, tx)
	{
	},
	anonymous_error_cb: function(feed_id, err_code, err_msg)
	{
		throw Error("[ws.spec/anonymous_error_cb] Got unexpected error code " + err_code + " and err_msg '" + err_msg + "'' but never expected to receive it yet."); 
	},
	forget_txs_cb: function(feed_id, for_address, from_tx_id)
	{
		sawForgetTxsCbWith_addresses.push(for_address)
		sawForgetTxsCbWith_fromTxIds.push(from_tx_id)
	},
	wallet_status_cb: function(feed_id, for_address, scan_block_height)
	{
		sawWalletStatusCbWith_addresses.push(for_address)
		sawWalletStatusCbWith_scannedBlockHeights.push(scan_block_height)
	},
	confirm_tx_cb: function(feed_id, tx_id, tx_hash, tx_height, tx_block_hash)
	{
		sawConfirmTxCbWith_tx_ids.push(tx_id)
	},
	optl__store_did_forget_txs_cb: function(tx_ids)
	{
		console.log("[ws.spec/optl__store_did_forget_txs_cb] with ids", tx_ids)
	}
})
//
var feed_channel = "default" // can probably be anything given this is the mock spec

var ws_feed_id = null;
var addr1 = "43zxvpcj5Xv9SEkNXbMCG7LPQStHMpFCQCmkmR4u5nzjWwq5Xkv5VmGgYEsHXg4ja2FGRD5wMWbBVMijDTqmmVqm93wHGkg"
var vk1 = "7bea1907940afdd480eff7c4bcadb478a0fbb626df9e3ed74ae801e18f53e104"
describe("websocket API tests", function()
{
	it("can connect", function(done) {
		ws_feed_id = client.connect(
			feed_channel, 
			function() {
				console.log("[ws.mock.spec] Connected.")
				done();
			},
			function(err) {
				assert.equal(null, err);
				console.log("[ws.mock.spec] Connection error.")
				done();
			},
			function() {
				// disconnected . maybe overlap with error
			}
		)
		assert.notEqual(null, ws_feed_id)
	});
	it("can subscribe - A", function(done) {
		first__done_fn = done; // set this for later
		//
		const payload = client.new_subscribe_payload({
			address: addr1,
			view_key: vk1,
			// since_confirmed_tx_id is handled internally in the client
			// ,
			subaddresses: "0-3"
		})
		const this__req_id = payload.req_id;
		first__req_id = this__req_id; // save this for later
		client.send_payload__feed(ws_feed_id, payload)
	});
	it("can subscribe - B - no backlog", function(done) {
		second__done_fn = done; // set this for later
		//
		const payload = client.new_subscribe_payload({
			address: addr1,
			view_key: vk1,
			// since_confirmed_tx_id is handled internally in the client
			// ,
			payment_ids: [ "123" ],
			subaddresses: "ALL"
		})
		const this__req_id = payload.req_id;
		second__req_id = this__req_id; // save this for later
		client.send_payload__feed(ws_feed_id, payload)
	});
	it("can subscribe - C - erroring", function(done) {
		third__done_fn = done; // set this for later
		//
		const payload = client.new_subscribe_payload({
			address: "43zxvpcj5Xv9SEkNXbMCG7LPQStHMpFCQCmkmR4u5nzjWwq5Xkv5VmGgYEsHXg4ja2FGRD5wMWbBVMijDTqmmVqm93wHGkg",
			view_key: vk1,
			// since_confirmed_tx_id is handled internally in the client
			// ,
			subaddresses: "adfklkasdflkad" // this is expected to cause an error
		})
		const this__req_id = payload.req_id;
		third__req_id = this__req_id; // save this for later
		client.send_payload__feed(ws_feed_id, payload)
	});
	it("can unsubscribe - A - no error", function(done)
	{
		fourth__done_fn = done; // set this for later
		//
		const payload = client.new_unsubscribe_payload({
			address: "43zxvpcj5Xv9SEkNXbMCG7LPQStHMpFCQCmkmR4u5nzjWwq5Xkv5VmGgYEsHXg4ja2FGRD5wMWbBVMijDTqmmVqm93wHGkg",
			view_key: vk1,
			// since_confirmed_tx_id is handled internally in the client
			// ,
			subaddresses: "1-2" // this is not expected to cause an error
		})
		const this__req_id = payload.req_id;
		fourth__req_id = this__req_id; // save this for later
		client.send_payload__feed(ws_feed_id, payload)
	})
	it("can unsubscribe - B - erroring", function(done)
	{
		fifth__done_fn = done; // set this for later
		//
		const payload = client.new_unsubscribe_payload({
			address: "43zxvpcj5Xv9SEkNXbMCG7LPQStHMpFCQCmkmR4u5nzjWwq5Xkv5VmGgYEsHXg4ja2FGRD5wMWbBVMijDTqmmVqm93wHGkg",
			view_key: vk1,
			// since_confirmed_tx_id is handled internally in the client
			// ,
			subaddresses: "adfklkasdflkad" // this is expected to cause an error
		})
		const this__req_id = payload.req_id;
		fifth__req_id = this__req_id; // save this for later
		client.send_payload__feed(ws_feed_id, payload)
	})
	//
	it("can observe stateless post-initial-subscriptions updates", function(done)
	{
		var iterations = 0
		var maxAllowedIterations = 30
		//
		//
		var int = setInterval(function()
		{
			if (iterations == maxAllowedIterations) {
				throw Error("Failed to find all expected state updates")
			}
			iterations += 1;
			//
			if (hasReceivedA_block_info == false) {
				return // allow to pass to next interval, waiting for state
			}
			assert.notEqual(lastReceived_block_height, null);
			if (sawForgetTxsCbWith_addresses.length == 0) {
				return // wait for state
			}
			assert.notEqual(sawForgetTxsCbWith_addresses.indexOf(addr1), -1)
			assert.notEqual(sawForgetTxsCbWith_fromTxIds.length, 0)
			if (sawWalletStatusCbWith_addresses.length == 0) {
				return // wait for state
			}
			assert.notEqual(sawWalletStatusCbWith_addresses.indexOf(addr1), -1)
			assert.notEqual(sawWalletStatusCbWith_scannedBlockHeights.length, 0)
			//
			if (sawConfirmTxCbWith_tx_ids.length < 1) { // only expecting one confirmation
				return // wait for state
			}
			// 
			// That should be all expected state known for now... cancel interval and return
			clearInterval(int);
			done();
		}, 50);
	});
});


