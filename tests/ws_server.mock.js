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
//
const assert = require('assert')
const WebSocket = require('ws');
//
const ws_wireformat = require('../ws/ws_wireformat')
const WSOperation = ws_wireformat.WSOperation
const WSResponseType = ws_wireformat.WSResponseType
const WSErrorCode = ws_wireformat.WSErrorCode
//
const wss = new WebSocket.Server({ port: 8443 });
//


var _mocked_current_blockchain_height = 0;

wss.on('connection', function connection(ws)
{
	//
	var this_ws__seen_subscr_1 = false;
	var this_ws__seen_subscr_2 = false;
	var this_ws__seen_subscr_3 = false;
	//
	var this_ws__seen_unsub_1 = false;
	var this_ws__seen_unsub_2 = false;
	//
	var cached_subscr1__address = null;


	function __shared_send_mocked_txs(N_txs, ws)
	{
		const self = this;
		for (var i = 0 ; i < N_txs ; i++) {
			const this_res =
			{
				type: WSResponseType.tx,
				tx: {
					id: `${i}`, // string
					unlock_time: `${(_mocked_current_blockchain_height + 10)}`,
					address: cached_subscr1__address,
					hash: "123123-"+i,
					block_hash: "initialsubscrs",
					height: `${_mocked_current_blockchain_height}` // string
				}
			};
			setTimeout(function() {
				ws.send(JSON.stringify(this_res))
			}, 50*i)
		}
	}

	ws.on('message', function incoming(message)
	{
		const req = JSON.parse(message)
		console.log("--> req", req);
		const op = req.op 
		if (typeof op === 'undefined' && !op) {
			ws.send(JSON.stringify({
				type: WSResponseType.error,
				code: WSErrorCode.badRequest,
				Error: "Expected 'op'"
			}))
			return
		}
		if (op == WSOperation.subscribe_txs) {
			if (!this_ws__seen_subscr_1) {
				this_ws__seen_subscr_1 = true;
				//
				cached_subscr1__address = req.address

				_mocked_current_blockchain_height = 0 
				ws.send(JSON.stringify({
					type: WSResponseType.block_info, // the initial message, for now
					block: {
						height: "" + _mocked_current_blockchain_height,
						block_hash: "a block hash",
						per_byte_fee: "321321",
						fee_mask: "123123"
					}
				}));
				const N_txs = 3
				ws.send(JSON.stringify({
					type: WSResponseType.txs_initial_info,
					req_id: req.req_id,
					expect_backlog_txs: N_txs
				}));
				__shared_send_mocked_txs(N_txs, ws);
				return;
			}
			if (!this_ws__seen_subscr_2) {
				this_ws__seen_subscr_2 = true;
				//
				_mocked_current_blockchain_height += 13
				ws.send(JSON.stringify({
					type: WSResponseType.block_info,
					block: {
						height: "" + _mocked_current_blockchain_height,
						block_hash: "another block hash",
						per_byte_fee: "321321",
						fee_mask: "123123"
					}
				}));
				const N_txs = 0
				ws.send(JSON.stringify({
					type: WSResponseType.txs_initial_info,
					req_id: req.req_id,
					expect_backlog_txs: N_txs
				}));
				return;
			}
			if (!this_ws__seen_subscr_3) {
				this_ws__seen_subscr_3 = true;
				//
				ws.send(JSON.stringify({
					type: WSResponseType.error,
					req_id: req.req_id,
					code: WSErrorCode.badRequest,
					Error: "Invalid field value for 'subaddress'"
				}));
				return;
			}
			throw "Unexpected subscription"
		} else if (op == WSOperation.unsubscribe_txs) {
			if (!this_ws__seen_unsub_1) {
				this_ws__seen_unsub_1 = true;
				//
				ws.send(JSON.stringify({
					type: WSResponseType.unsubscribed,
					req_id: req.req_id
				}));

				return;
			}
			if (!this_ws__seen_unsub_2) {
				this_ws__seen_unsub_2 = true;
				//
				ws.send(JSON.stringify({
					type: WSResponseType.error,
					req_id: req.req_id,
					code: WSErrorCode.badRequest,
					Error: "Invalid field value for 'subaddress'"
				}));


				setTimeout(function() {
					var i = 150 
					ws.send(JSON.stringify({
						type: WSResponseType.tx,
						tx: {
							id: `${i}`,
							hash: "123123-a",
							address: cached_subscr1__address,
							unlock_time: `${_mocked_current_blockchain_height + 10}`,
							block_hash: "prereorg",
							height: `${_mocked_current_blockchain_height}`
						}
					}));
					ws.send(JSON.stringify({
						type: WSResponseType.tx,
						tx: {
							id: `${i+1}`,
							hash: "123123-b",
							address: cached_subscr1__address,
							unlock_time: `${_mocked_current_blockchain_height + 11}`,
							block_hash: "prereorg",
							height: `${_mocked_current_blockchain_height}`
						}
					}));
					//
					_mocked_current_blockchain_height -= 7 // simulate rollback (some portion of the simulated increment)
					//
					ws.send(JSON.stringify({
						type: WSResponseType.forget_txs,
						address: cached_subscr1__address,
						from_tx_id: `${i}`
					}))
					setTimeout(function()
					{
						ws.send(JSON.stringify({
							type: WSResponseType.wallet_status,
							address: cached_subscr1__address,
							scan_block_height: `${_mocked_current_blockchain_height - 3}`
						}))
						//
						// rebroadcasting those txs after 'reorg'
						ws.send(JSON.stringify({
							type: WSResponseType.tx,
							tx: {
								id: `${i}`,
								hash: "123123-a",
								address: cached_subscr1__address,
								unlock_time: `${_mocked_current_blockchain_height + 10}`,
								block_hash: "postreorg",
								height: `${_mocked_current_blockchain_height}`
							}
						}));
						ws.send(JSON.stringify({
							type: WSResponseType.tx,
							tx: {
								id: `${i+1}`,
								hash: "123123-b",
								address: cached_subscr1__address,
								unlock_time: `${_mocked_current_blockchain_height + 11}`,
								block_hash: "postreorg",
								height: `${_mocked_current_blockchain_height}`
							}
						}));
						ws.send(JSON.stringify({
							type: WSResponseType.tx,
							tx: {
								hash: "123123-mempool",
								address: cached_subscr1__address,
								unlock_time: `${_mocked_current_blockchain_height + 11}`
							}
						}));
						//
						ws.send(JSON.stringify({
							type: WSResponseType.confirm_tx,
							tx: {
								id: `${i+2}`,
								hash: "123123-mempool",
								height: `${_mocked_current_blockchain_height}`,
								block_hash: "postreorg"
							}
						}))
					}, 50)
				}, 300) // after a little while

				return;
			}
			throw "Unexpected unsubscribe"

		} else {
			throw "Unexpected operation " + req.op
		}
	});
});