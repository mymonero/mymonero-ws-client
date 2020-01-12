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
const WebSocket = require('ws'); // this is specified as a dev dependency for tests 
const ws_transport__base = require('./ws_transport__base')
//
class Class extends ws_transport__base
{
	constructor(args)
	{
		super(args)
		//
		this.websockets_by_feed_id = {}
		this.isConnected_by_feed_id = {}
		this.ws_url_base = args.ws_url_base || 'ws://api.mymonero.com:8091'
	}
	//
	connect_feed(args)
	{
		const self = this
		if (!args.feed_id) {
			throw Error("[ws_transport.real/connect_feed] Expected args.feed_id")
		}
		const existing_ws = self.websockets_by_feed_id[args.feed_id];
		if (typeof existing_ws !== 'undefined' || existing_ws) {
			throw Error("[ws_transport.real/connect_feed] A ws is already registered for that feed_id")
		}
		if (!args.connect_fn) {
			throw Error("[ws_transport.real/connect_feed] Expected args.connect_fn") // make bad args obvious
		}
		if (!args.on_message_fn) {
			throw Error("[ws_transport.real/connect_feed] Expected args.on_message_fn") // make bad args obvious
		}
		//
		const ws = new WebSocket(this.ws_url_base + "/feed");
		self.websockets_by_feed_id[args.feed_id] = ws
		ws.on('open', function()
		{ 
			console.log("[ws_transport.real/connect_feed/ws.on.open]")
			self.isConnected_by_feed_id[args.feed_id] = true; 
			args.connect_fn() 
		});
		ws.on('error', function(err)
		{
			args.error_fn(err)
		});
		ws.on('message', function(msg)
		{
			const payload = JSON.parse(msg) // allowing exceptions to be thrown
			console.log("[ws_transport.real/connect_feed/ws.on.message]")
			args.on_message_fn(payload)
		});
		ws.on('close', function()
		{
			console.log("[ws_transport.real/connect_feed/ws.on.close]")
			self.isConnected_by_feed_id[args.feed_id] = false;
			delete self.websockets_by_feed_id[args.feed_id]
		})
	}
	disconnect_feed(feed_id)
	{
		const self = this
		const ws = self.websockets_by_feed_id[feed_id]
		if (typeof ws === 'undefined' || !ws) {
			throw Error("[ws_transport.real/disconnect_feed] Expected ws for that feed_id")
		}
		ws.close()
		// this ought to trigger ws.on('close') which will clean up local state
	}
	send_on_feed(feed_id, params)
	{
		const self = this
		const ws = self.websockets_by_feed_id[feed_id]
		if (typeof ws === 'undefined' || !ws) {
			throw Error("[ws_transport.real/send_on_feed] Expected ws for that feed_id")
		}
		ws.send(JSON.stringify(params))
	}
}
//
module.exports = Class;