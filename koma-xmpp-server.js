/*
 * Copyright   : KOMA-Network (Indonesia IoT Club)
 * Create by   : Yan Yan Purdiansah
 * Create date : 01/06/2020
 * Link        : https://github.com/yypurdi/koma-msb-service
 * Description : This is Script for Micro Service Bus with XMPP Service, MQTT Service and HTTP Service
 */

var net = require('net');
var zmq = require('zeromq/v5-compat');
var events = require('events');
var crypto = require('crypto');

/*
 * Definition Object for Mapping XML to JSON Convertion in XMPP Protocol
 */
var options = {
    attributeNamePrefix : "",
    attrNodeName: "attr",
    textNodeName : "content",
    ignoreAttributes : false,
    ignoreNameSpace : false,
    allowBooleanAttributes : false,
    parseNodeValue : true,
    parseAttributeValue : true,
    trimValues: true,
    cdataTagName: "__cdata",
    cdataPositionChar: "\\c",
    localeRange: "",
    parseTrueNumberOnly: false
};

/*
 * Definition Object for Mapping JSON to XML Convertion in XMPP Protocol
 */
var defaultOptions = {
    attributeNamePrefix : "",
    attrNodeName: "attr",
    textNodeName : "content",
    ignoreAttributes : false,
    cdataTagName: "__cdata",
    cdataPositionChar: "\\c",
    format: false,
    indentBy: "  ",
    supressEmptyNode: false
};

/*
 * Library for XML/JSON Conversion
 */
var xmlToJson = require('fast-xml-parser');
var j2xparser = require("fast-xml-parser").j2xParser;
var jsonToXml = new j2xparser(defaultOptions);

/*
 * Server Configuration
 */
const domain = 'koma-network.com';
const host = '192.168.43.221';
const port = 5222;
const port_balancer_router = 6000;
const port_balancer_dealer = 6001;
const port_publisher_pul = 6002;
const port_publisher_pub = 6003;
const port_proxy_router = 6004;
const port_proxy_dealer = 6005;

/*
 * Server Parameters
 */
const key = 'wmQ45QjYpC38W3i1';
var prefixId = randomString(5) + '-';
var counter  = 0;

require('events').EventEmitter.prototype._maxListeners = 0;
process.setMaxListeners(0);
process.on('warning', function(e){
    console.log(e.name);
});

/*
 * Start Zero Message Queue
 */
var balancer_router = zmq.socket('router');
var balancer_dealer = zmq.socket('dealer');
var publisher_pul = zmq.socket('pull');
var publisher_pub = zmq.socket('pub');
var proxy_router = zmq.socket('router');
var proxy_dealer = zmq.socket('dealer');

balancer_router.bind('tcp://127.0.0.1:' + port_balancer_router);
balancer_dealer.bind('tcp://127.0.0.1:' + port_balancer_dealer);
publisher_pul.bind('tcp://127.0.0.1:' + port_publisher_pul);
publisher_pub.bind('tcp://127.0.0.1:' + port_publisher_pub);
proxy_router.bind('tcp://127.0.0.1:' + port_proxy_router);
proxy_dealer.bind('tcp://127.0.0.1:' + port_proxy_dealer);

balancer_router.on('message', function () {
  var args = Array.apply(null, arguments);
  balancer_dealer.send(args);
});

balancer_dealer.on('message', function () {
  var args = Array.apply(null, arguments);  
  balancer_router.send(args);
});

publisher_pul.on('message', function () {
  var args = Array.apply(null, arguments);
  publisher_pub.send(args);
});

proxy_router.on('message', function () {
  var args = Array.apply(null, arguments);
  proxy_dealer.send(args);
});

proxy_dealer.on('message', function () {
  var args = Array.apply(null, arguments);
  proxy_router.send(args);
});

/*
 * Start Code Event Request
 */
var eventRequest = new events.EventEmitter();
var requester = zmq.socket('req');
requester.connect('tcp://localhost:' + port_balancer_router);
eventRequest.on('data', function (jsonObj) {    
    requester.send(JSON.stringify(jsonObj));
});
eventRequest.setMaxListeners(0);
requester.on('message', function(msg) {
    var reply = msg.toString('utf8');
});

/*
 * Start Code Event Response
 */
var eventResponse = new events.EventEmitter();
var subscriber = zmq.socket('sub');
subscriber.connect('tcp://localhost:' + port_publisher_pub);
subscriber.subscribe('');    
subscriber.on('message', function (msg) {
    eventResponse.emit('data',msg.toString('utf8'));
});
eventResponse.setMaxListeners(0);

/*
 * Start Code for Helper Functions
 */
function encrypt(data, key) {
    var decodeKey = crypto.createHash('sha256').update(key, 'utf-8').digest();
    var cipher = crypto.createCipheriv('aes-256-cbc', decodeKey, Buffer.from(key));
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
  };

function decrypt(data, key) {
    var encodeKey = crypto.createHash('sha256').update(key, 'utf-8').digest();
    var cipher = crypto.createDecipheriv('aes-256-cbc', encodeKey, Buffer.from(key));
    return cipher.update(data, 'hex', 'utf8') + cipher.final('utf8');
  };

function addAttribute(jsonObject,tag,sessionId,domain,ip,port){
    if(jsonObject[tag].attr === undefined){
        jsonObject[tag].attr = {};
    }
    jsonObject[tag].attr.session = sessionId;
    jsonObject[tag].attr.domain = domain;
    jsonObject[tag].attr.ip = ip;
    jsonObject[tag].attr.port = port;
    jsonObject[tag].attr.protocol = 'xmpp';

    if(tag=='stream:stream'){
        if(jsonObject[tag].attr.hasOwnProperty('id')){
            jsonObject[tag].attr.status = 'success';
        }else{
            jsonObject[tag].attr.status = '';
        }
    }
    return jsonObject;
}

function randomString(len, charSet) {
    charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var randomString = '';
    for (var i = 0; i < len; i++) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}

/*
 * Start Code for XMPP Service
 */
const server = net.createServer();
server.listen(port,host,function () {    
    
    var serverInfoJson = JSON.stringify(server.address().address+':'+server.address().port);
    console.log('TCP server listen on address : ' + serverInfoJson);
    
    var connections = {};
    var users = {};
    var sessions = {};

    eventResponse.on('data',function (data) {

        let message = data.toString('utf-8');
        let sessionId = message.split(':&:%:#:',1);
        var msg = message.replace(sessionId+':&:%:#:','');        
        var jsonObj = JSON.parse(msg);
        //console.log(jsonObj);

        if(jsonObj.hasOwnProperty('stream:stream')){
            let xml = jsonToXml.parse(jsonObj);
            xml = xml.replace("</stream:stream>","");
            /*
             * Check if the open socket is exist or not
             */
            if(connections[sessionId]!=null){
                connections[sessionId].write(xml);
                console.log('Server : ' + sessionId + ' -> stream:stream');
            }
        }
        else if(jsonObj.hasOwnProperty('stream:features')){
            let xml = jsonToXml.parse(jsonObj);
            /*
             * Check if the open socket is exist or not
             */
            if(connections[sessionId]!=null){
                connections[sessionId].write(xml);
                console.log('Server : ' + sessionId + ' -> stream:features');
            }
        }
        else{
            /*
             * Update the users list of connection 
             */            
            var jsonObjOut = JSON.parse(msg);
            if(jsonObjOut.hasOwnProperty('iq')){
                if(jsonObjOut.iq.hasOwnProperty('bind')){
                    if(jsonObjOut.iq.bind.hasOwnProperty('jid')){
                        let jid = jsonObjOut.iq.bind.jid;                        
                        sessions[jid] = sessionId;
                        users[sessionId] = jid;
                    }
                }
            }

            /*
            * Check if redirection to antother user
            */
            let tag = Object.getOwnPropertyNames(jsonObjOut);
            if(Array.isArray(jsonObjOut[tag])==true){
                for(let no in jsonObjOut[tag]){
                    jsonObjArray = {tag:''};
                    jsonObjArray[tag] = jsonObjOut[tag][no];
                    //console.log(JSON.stringify(jsonObjArray));
                }
            }else{
                if(jsonObjOut.hasOwnProperty(tag)){
                    if(jsonObjOut[tag].hasOwnProperty('attr')){
                        if(jsonObjOut[tag].attr.hasOwnProperty('to')){
                            let to = jsonObjOut[tag].attr.to;
                            if(sessions.hasOwnProperty(to)){
                                sessionId = sessions[to];
                                //console.log('Server : ' + sessionId + ' -> '+to);
                            }
                        }
                    }
                }
            }
            /*
            * Check if the open socket is exist or not and parse to xml
            */
            if(connections[sessionId]!=null){
                let jsonToXml = new j2xparser(defaultOptions);
                let xml = jsonToXml.parse(jsonObjOut);
                connections[sessionId].write(xml);
                if(tag=='iq'){
                    let subtag = Object.getOwnPropertyNames(jsonObjOut.iq);
                    console.log('Server : ' + sessionId + ' -> '+tag+'/'+subtag.slice()[0]);
                }
                else{
                    console.log('Server : ' + sessionId + ' -> '+tag);
                }
            }
        }
    });

    server.on('connection', function(connection){
                
        let remote_ip = connection.remoteAddress;
        let remote_port = connection.remotePort;
        let sessionId = encrypt(remote_port.toString(),key);

        connection.setEncoding('utf-8');
        connections[sessionId] = connection;
        
        connection.on('data', function (data) {
            /*
             * Receive message and parse from Xml String to Json Object
             */
            try{                
                if(data.toString().startsWith('<')){

                    var jsonObj = xmlToJson.parse(data,options);

                    if(jsonObj.hasOwnProperty('stream:stream'))
                    {
                        eventRequest.emit('data',addAttribute(jsonObj,'stream:stream',sessionId,domain,remote_ip,remote_port));
                        //console.log('Client : ' + sessionId + ' -> stream:stream');
                    }
                    else if(jsonObj.hasOwnProperty('auth'))
                    {
                        eventRequest.emit('data',addAttribute(jsonObj,'auth',sessionId,domain,remote_ip,remote_port));
                        console.log('Client : ' + sessionId + ' -> auth');
                    }
                    else if(jsonObj.hasOwnProperty('response'))
                    {                
                        eventRequest.emit('data',addAttribute(jsonObj,'response',sessionId,domain,remote_ip,remote_port));
                        console.log('Client : ' + sessionId + ' -> response');
                    }
                    else if(jsonObj.hasOwnProperty('iq'))
                    {                        
                        if(Array.isArray(jsonObj.iq)==true){
                            for(let no in jsonObj.iq){
                                let jsonObjArray = {iq:''};
                                jsonObjArray.iq = jsonObj.iq[no];
                                eventRequest.emit('data',addAttribute(jsonObjArray,'iq',sessionId,domain,remote_ip,remote_port));
                                //console.log('Client : ' + sessionId + ' -> iq');
                            }
                        }
                        else {
                           eventRequest.emit('data',addAttribute(jsonObj,'iq',sessionId,domain,remote_ip,remote_port));
                           let subtag = Object.getOwnPropertyNames(jsonObj.iq);
                           //console.log('Client : ' + sessionId + ' -> iq/'+subtag.slice()[1]);
                        }
                    }
                    else if(jsonObj.hasOwnProperty('presence'))
                    {              
                        if(Array.isArray(jsonObj.presence)==true){
                            for(let no in jsonObj.presence){
                                let jsonObjArray = {presence:''};
                                jsonObjArray.presence = jsonObj.presence[no];
                                eventRequest.emit('data',addAttribute(jsonObjArray,'presence',sessionId,domain,remote_ip,remote_port));
                                console.log('Client : ' + sessionId + ' -> presence');
                            }
                        }
                        else {            
                            eventRequest.emit('data',addAttribute(jsonObj,'presence',sessionId,domain,remote_ip,remote_port));
                            console.log('Client : ' + sessionId + ' -> presence');
                        }
                    }
                    else if(jsonObj.hasOwnProperty('message'))
                    {
                        if(Array.isArray(jsonObj.message)==true){
                            for(let no in jsonObj.message){
                                let jsonObjArray = {message:''};
                                jsonObjArray.message = jsonObj.message[no];
                                eventRequest.emit('data',addAttribute(jsonObjArray,'message',sessionId,domain,remote_ip,remote_port));
                                console.log('Client : ' + sessionId + ' -> message');                                
                            }
                        }
                        else{
                            eventRequest.emit('data',addAttribute(jsonObj,'message',sessionId,domain,remote_ip,remote_port));
                            if(jsonObj.message.hasOwnProperty('body')){
                                console.log('Client : ' + jsonObj.message.attr.to + ' -> message');
                            }else if(jsonObj.message.hasOwnProperty('composing')){
                                console.log('Client : ' + jsonObj.message.attr.to + ' -> typing');
                            }else if(jsonObj.message.hasOwnProperty('paused')){
                                console.log('Client : ' + jsonObj.message.attr.to + ' -> paused');
                            }else if(jsonObj.message.hasOwnProperty('gone')){
                                console.log('Client : ' + jsonObj.message.attr.to + ' -> gone');
                            }                                
                        }
                    }
                    else{
                        connection.end;
                    }        
                }
                else{
                    console.log('Client : ' + sessionId + ' -> data is not defined as XMPP protocol');
                    connection.end();
                    connections[sessionId] = null;    
                }
            }
            catch(error){
                console.log(error);
                connection.end();
                connections[sessionId] = null;
            }        
        });

        connection.on('end', function () {
            counter += 1;
            let packetId = prefixId + counter;
            jsonObj = {presence:{attr:{id:packetId,type:'unavailable'}}};
            eventRequest.emit('data',addAttribute(jsonObj,'presence',sessionId,domain,remote_ip,remote_port));
            console.log('Client : ' + sessionId + ' -> disconnected');
        });

        connection.on('timeout', function () {
            console.log('Client : ' + sessionId + ' -> timeout');
        });

        connection.on('error', function (error) {
            if(error.message == 'read ECONNRESET'){
                connection.end;
                counter += 1;
                let packetId = prefixId + counter;
                jsonObj = {presence:{attr:{id:packetId,type:'unavailable'}}};    
                eventRequest.emit('data',addAttribute(jsonObj,'presence',sessionId,domain,remote_ip,remote_port));
                console.log('Client : ' + sessionId + ' -> disconnected');
            }else{
                if(connection.destroyed!=true)
                    console.log('Client : ' + sessionId + ' -> error'+error.message);
            }
        });
    });

    server.on('close', function () {
        console.log('Client : ' + sessionId + ' -> socket is closed');
    });

    server.on('error', function (error) {
        console.log('Client : ' + sessionId + ' -> error'+error.message);
    });
});
