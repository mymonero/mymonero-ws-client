// Copyright (c) 2014-2020, MyMonero.com
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
function __REST_body_base(address, view_key)
{
    return {
        address: address, 
        view_key: view_key,
    }
}
async function __REST_fetch_POST(fetch, REST_url_base, path, body)
{
    return await fetch(`${REST_url_base}${path}`, {
        method: 'POST', 
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    })
}
async function _REST_login(fetch, REST_url_base, address, view_key)
{
    const body = __REST_body_base(address, view_key)
    body.create_account = true
    //
    let res = await __REST_fetch_POST(fetch, REST_url_base, "/login", body)
    let json = await res.json()
    console.log("/login Got JSON: ", json)
    //
    return json
}
//
class WSFeedPool
{
    constructor(options)
    {
        const self = this
        // input validation
        if (typeof options.ws_client == 'undefined' || !options.ws_client) {
            throw "[WSFeedPool()] expected options.ws_client"
        }
        if (typeof options.REST_url_base == 'undefined' || !options.REST_url_base) {
            throw "[WSFeedPool()] expected options.REST_url_base"
        }
        if (typeof options.fetch == 'undefined' || !options.fetch) {
            throw "[WSFeedPool()] expected options.fetch"
        }
        // init
        self.REST_url_base = options.REST_url_base
        self.fetch = options.fetch
        self.a_ws_did_dc__fn = options.a_ws_did_dc__fn || function(ws_feed_id) {}
        self.ws_client = options.ws_client
        //
        // runtime - setup
        self.connectingTo_feed_ids_by_feed_channel = {}
        self.connectedTo_feed_ids_by_feed_channel = {}
        self.didConnectCBsWaiting_by_feed_id = {} 
    }
    //
    // Imperatives
    async stepI__get_feed_channel(address, view_key)
    { // The /login must be present here for two reasons: create any new accounts on server so we don't get 404, and obtain the feed_channel
        const self = this
        let login_res_json
        try {
            login_res_json = await _REST_login(
                self.fetch,
                self.REST_url_base,
                address, 
                view_key
            )
        } catch (e) { // catching only so we can log specifically 
            console.error("/login error ('" + e + "') … closing wallet.")
            throw e // errors here will be thrown again and should cause the caller of subscribe_with(…) to e.g. _close_wallet()
        }
        var feed_channel = login_res_json.feed_channel
        if (!feed_channel || typeof feed_channel == 'undefined') {
            console.warn("Server supplied no .feed_channel in /login res - using 'default'.")
            feed_channel = "default" // in case the REST API doesn't support this, assume singular channel (this value itself doesn't matter)
        }
        // const new_address = login_res_json.new_address
        // const start_height = login_res_json.start_height // TODO: save this locally?

        return feed_channel
    }
    stepII__connect_with(feed_channel, connected_fn)
    {
        const self = this
        let connectedTo_ws_feed_id = self.connectedTo_feed_ids_by_feed_channel[feed_channel] // is there one connected already?
        if (typeof connectedTo_ws_feed_id !== 'undefined' && connectedTo_ws_feed_id) {
            console.log("[ws_feed_pool/stepII__connect_with] Already connected to feed with id", connectedTo_ws_feed_id)
            setTimeout(function()
            {
                connected_fn(connectedTo_ws_feed_id)
            }, 1)
            return connectedTo_ws_feed_id // already connected
        }
        function addConnectCBWaitingFor(ws_feed_id, connected_fn)
        {
            if (typeof self.didConnectCBsWaiting_by_feed_id[ws_feed_id] === 'undefined' || !self.didConnectCBsWaiting_by_feed_id[ws_feed_id]) {
                self.didConnectCBsWaiting_by_feed_id[ws_feed_id] = []
            }
            console.log("Pushing cb to self.didConnectCBsWaiting_by_feed_id["+ws_feed_id+"]")
            self.didConnectCBsWaiting_by_feed_id[ws_feed_id].push(connected_fn) // so that it gets called on connect
        }
        let connectingTo_ws_feed_id = self.connectingTo_feed_ids_by_feed_channel[feed_channel] // is one currently trying to connect?
        if (typeof connectingTo_ws_feed_id !== 'undefined' && connectingTo_ws_feed_id) {
            console.log("[ws_feed_pool/stepII__connect_with] Already trying to open a connection to feed with id", connectingTo_ws_feed_id)
            addConnectCBWaitingFor(connectingTo_ws_feed_id, connected_fn)
            //
            return connectingTo_ws_feed_id
        }
        let ws_feed_id = self.ws_client.connect(
            feed_channel, // obtained from /login; used in connection uri
            function()
            { 
                self.connectedTo_feed_ids_by_feed_channel[feed_channel] = ws_feed_id
                delete self.connectingTo_feed_ids_by_feed_channel[feed_channel]
                //
                let cbs = self.didConnectCBsWaiting_by_feed_id[ws_feed_id]
                for (var i = 0 ; i < cbs.length ; i++) {
                    cbs[i](ws_feed_id)
                }
            },
            function(err)
            { // ws_error_cb
                console.log("[ws_feed_pool/stepII__connect_with] A WS feed connection errored with", err)
                //
                delete self.connectedTo_feed_ids_by_feed_channel[feed_channel]
                delete self.connectingTo_feed_ids_by_feed_channel[feed_channel]
            },
            function()
            { 
                console.log("[ws_feed_pool/stepII__connect_with] A WS feed disconnected")
                //
                delete self.connectedTo_feed_ids_by_feed_channel[feed_channel]
                delete self.connectingTo_feed_ids_by_feed_channel[feed_channel]
                //
                self.a_ws_did_dc__fn(ws_feed_id) // usable to cause a hypothetical integrator's wallet to close if the ws hangs up
            }
        )
        console.log("[ws_feed_pool/stepII__connect_with] Will connect fresh to new ws feed with id", ws_feed_id)
        {
            self.connectingTo_feed_ids_by_feed_channel[feed_channel] = ws_feed_id 
            // we also have to add the did connect cb here
            addConnectCBWaitingFor(ws_feed_id, connected_fn)
        }
        //
        return ws_feed_id
    }
    //
    submit_subscribe(ws_feed_id, address, view_key)
    {
        const self = this
        self.ws_client.send_payload__feed(ws_feed_id, self.ws_client.new_subscribe_payload({
            address: address,
            view_key: view_key,
            // "since_confirmed_tx_id is handled internally in the client"
        }))
    }
    submit_unsubscribe(ws_feed_id, address)
    {
        const self = this
        self.ws_client.send_payload__feed(ws_feed_id, self.ws_client.new_unsubscribe_payload({
            address: address
        }))
    }
    //
    // Not really needed
    // _disconnect_feed(ws_feed_id)
    // {
    //     const self = this
    //     self.ws_client.disconnect_feed(ws_feed_id)
    // }
}   
module.exports = WSFeedPool