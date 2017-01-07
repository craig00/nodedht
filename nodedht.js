"use strict";
const crypto = require('crypto');
const fs = require('fs');
const bencode = require('bencode');
const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const PUBLICNODES = [{"address":"router.bittorrent.com","port":6881},{"address":"dht.transmissionbt.com","port":6881},{"address":"router.utorrent.com","port":6881}];
const TABLEMAX = 900;
var nodedht = function (port){
	this.port = port;
	this.nid = crypto.createHash('sha1').update(crypto.randomBytes(20)).digest();
	this.socketserver = dgram.createSocket('udp4');
	this.table = new Map();
	this.tablenum = 0;
}
nodedht.prototype.socketserverinit = function(){
	this.socketserver.on('error', (err) => {
		console.log(`server error:\n${err.stack}`);
		this.socketserver.close();
	});
	this.socketserver.on('close', ()=>{
		console.log(`server closed`);
	});
	this.socketserver.on('message', (msg, rinfo) => {
		let message = bencode.decode(msg);
		let query,infohash_value;
		if (message.y && message.y.toString() == 'q') {
			console.log('q');
			switch(message.q.toString()){
				case "ping":
				query ={
					"t":message.t,
					"y":Buffer.from("r"),
					"r":{"id":Buffer.concat([message.a.id.slice(0,10),this.nid.slice(10,20)])}
				}
				this.sendmessage(query,rinfo);
				break;
				case "find_node":
				query = {
					"t":message.t,
					"y":Buffer.from("r"),
					"r":{"id":Buffer.concat([message.a.id.slice(0,10),this.nid.slice(10,20)]),"node":""}
				}
				
				this.sendmessage(query,rinfo);
				break;
				case "get_peers"://get infohash
				console.log('get_peers');
				query = {
					"t":message.t,
					"y":Buffer.from("r"),
					"r":{"id":Buffer.concat([message.a.id.slice(0,10),this.nid.slice(10,20)]),"token":message.a.id.slice(0,4),"node":""}
				}
				infohash_value = message.a.info_hash.toString('hex');
				fs.appendFile('info.txt', 'magnet:?xt=urn:btih:'+infohash_value+'\r\n', (err) => {
					if (err) throw err;
				});
				break;
				case "announce_peer"://get infohash
				console.log('announce_peer');
				query = {
					"t":message.t,
					"y":Buffer.from("r"),
					"r":{"id":Buffer.concat([message.a.id.slice(0,10),this.nid.slice(10,20)])}
				}
				infohash_value = message.a.info_hash.toString('hex');
				fs.appendFile('infoannouce.txt', 'magnet:?xt=urn:btih:'+infohash_value+'\r\n', (err) => {
					if (err) throw err;
				});
				break;
				default:
				break;
			}
		}else if (message.y && message.y.toString() == 'r') {
			if (message.r.nodes) {
				for(let i = 0,len = message.r.nodes.length;i<len/26;i++){
					let nid = message.r.nodes.slice(0+26*i,20+26*i);
					let naddress = message.r.nodes[20+26*i]+"."+message.r.nodes[21+26*i]+"."+message.r.nodes[22+26*i]+"."+message.r.nodes[23+26*i];
					let nport = message.r.nodes.readUInt16BE(24+26*i);
					if (nid != this.nid && !this.table.has(nid) && this.tablenum < TABLEMAX && nport > 0 && nport < 65536) {
						this.table.set(nid,{address:naddress,port:nport});
						this.tablenum++;
					}
					
				}
				
			}
		}else if (message.y && message.y.toString() == 'e') {
			console.log(message.e.toString());
			if (message.e.toString() == "203,invalid value for 'id'") {
				this.nid = crypto.createHash('sha1').update(crypto.randomBytes(20)).digest();
			}
		}
	});
	this.socketserver.bind(this.port);
	

}
nodedht.prototype.sendmessage = function(message,rinfo){
	this.socketserver.send(bencode.encode(message), rinfo.port, rinfo.address);
};
var client = new nodedht(6880);
client.socketserverinit();

setInterval(function(){
	
	for (var i = PUBLICNODES.length - 1; i >= 0; i--) {
		client.sendmessage({
			"t":crypto.randomBytes(2),
			"y":Buffer.from("q"),
			"q":Buffer.from("find_node"),
			"a":{
				"id":client.nid,
				"target":crypto.createHash('sha1').update(crypto.randomBytes(20)).digest()
			}
		},PUBLICNODES[i]);
	}
},10);
setInterval(function(){
	for( let key of client.table.keys()){
		
		client.sendmessage({
			"t":crypto.randomBytes(2),
			"y":Buffer.from("q"),
			"q":Buffer.from("find_node"),
			"a":{
				"id":Buffer.concat([key.slice(0,10),client.nid.slice(10,20)]),
				"target":crypto.createHash('sha1').update(crypto.randomBytes(20)).digest()
			}
		}, client.table.get(key));

	}
	client.table.clear();
	client.tablenum = 0;
},900);

