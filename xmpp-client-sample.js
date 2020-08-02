/*
 * Copyright   : KOMA-Network (Indonesia IoT Club)
 * Create by   : Yan Yan Purdiansah
 * Create date : 01/06/2020
 * Link        : https://github.com/yypurdi/koma-xmpp
 * Description : This is the sample script for compatibility between FCM and KOMA in XMPP/Raw protocol access
 *               This script is implemented in App Server side in Trusted Environment
 */

var net = require('net');
var xmlToJson = require('fast-xml-parser');
var j2xparser = require("fast-xml-parser").j2xParser;
var jsonToXml = new j2xparser(defaultOptions);
var Base64 = require('js-base64').Base64;
var md5 = require('md5');
var Sasl = require('saslmechanisms');
var factory = new Sasl.Factory();

/*
 * SASL authentication and data security of PLAIN SASL mechanism
 */
factory.use(require('sasl-digest-md5'));
var mech = factory.create(['DIGEST-MD5']);

/*
 * XMPP Protocol Attribute Definitions XML to JSON
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
 * XMPP Protocol Attribute Definitions JSON to XML
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
 * Const value for XMPP protocol parameter
 */
const DOMAIN = 'koma-network.com';
const HOST = '192.168.43.221';
const PORT = 5222;
const USERNAME = '6010002';
const PASSWORD = '1234';
const DIGEST_URI = 'xmpp/' + DOMAIN;
const NC = '00000001';
const QOP = 'auth';        

/*
 * Value for Conection and Authentication Status
 */
var success = false;
var prefixId = randomString(5)+'-';
var counter = Number(0);

/*
 * Helper functions for ID Generator
 */
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
 * Helper functions for SASL Authentication in XMPP protocol
 */
function createResponse(user,realm,password,nonce,cnonce,digest_uri,nc,qop){
    var X = user + ':' + realm + ':' + password;
    var Y = md5(X);
    var T1 = Buffer.from(':' + nonce + ':' + cnonce).toString('hex');
    var A1 = Buffer.from( Y + T1,'hex');
    var A2 = 'AUTHENTICATE' + ':' +  digest_uri;
    var HA1 = md5(A1);
    var HA2 = md5(A2);
    var KD = HA1 + ':' + nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + HA2;
    var Z = md5(KD);
    var resp = 'charset=utf-8,username="'+user+'",realm="'+realm+'",nonce="'+nonce+'",nc='+nc+',cnonce="'+cnonce+'",digest-uri="'+digest_uri+'",maxbuf=65536,response="'+Z+'",qop='+qop;
    return resp;    
}

function log(data){
    var jsonObj = xmlToJson.parse(data,options);
    console.log(jsonObj);
}
/*
 * Create TLS Connection
 */
var client = net.connect(PORT, HOST, function() {
    client.setEncoding('utf-8');
    client.write("<stream:stream xmlns='jabber:client' to='" + DOMAIN + "' from = '6010002@koma-network.com' xmlns:stream='http://etherx.jabber.org/streams' version='1.0'>");
});

/*
 * Event from Connection
 */
client.on("data", function(data) {

    var jsonObj = xmlToJson.parse(data,options);
    
    if(jsonObj.hasOwnProperty('stream:stream')){        
        console.log(jsonObj);
        if(jsonObj.hasOwnProperty('stream:features')){
            if(jsonObj['stream:features'].hasOwnProperty('bind')){
                let xml = '<iq type="set"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>Node-1.0</resource></bind></iq>';
                client.setEncoding('utf-8');
                client.write(xml);
                log(xml);
            }
            else{
                let xml = '<auth mechanism="DIGEST-MD5" xmlns="urn:ietf:params:xml:ns:xmpp-sasl">=</auth>';
                client.setEncoding('utf-8');
                client.write(xml);
                log(xml);
            }    
        }
        else if(jsonObj['stream:stream'].hasOwnProperty('stream:features')){
            let stream = jsonObj['stream:stream'];
            if(stream['stream:features'].hasOwnProperty('bind')){
                let xml = '<iq type="set"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>Node-1.0</resource></bind></iq>';
                client.setEncoding('utf-8');
                client.write(xml);
                log(xml);
            }
            else{
                let xml = '<auth mechanism="DIGEST-MD5" xmlns="urn:ietf:params:xml:ns:xmpp-sasl">=</auth>';
                client.setEncoding('utf-8');
                client.write(xml);
                log(xml);
            }
        }
    }
    else if(jsonObj.hasOwnProperty('stream:features')){
        console.log(jsonObj);
        if(jsonObj['stream:features'].hasOwnProperty('bind')){
            let xml = '<iq type="set"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>Node-1.0</resource></bind></iq>';
            client.setEncoding('utf-8');
            client.write(xml);
            log(xml);
        }
        else{
            let xml = '<auth mechanism="DIGEST-MD5" xmlns="urn:ietf:params:xml:ns:xmpp-sasl">=</auth>';
            client.setEncoding('utf-8');
            client.write(xml);
            log(xml);
        }
    }
    else if(jsonObj.hasOwnProperty('challenge')){
        console.log(jsonObj);
        var content = Base64.decode(jsonObj.challenge.content);
        var challenge = mech.challenge(content);        
        var response = createResponse(USERNAME,challenge._realm,PASSWORD,challenge._nonce,randomString(40),DIGEST_URI,NC,QOP);
        var encode64 = Base64.encode(response);        
        let xml = '<response xmlns="urn:ietf:params:xml:ns:xmpp-sasl">'+encode64+'</response>';
        client.write(xml);
        log(xml);
    }
    else if(jsonObj.hasOwnProperty('success')){
        console.log(jsonObj);
        success = true;
        client.setEncoding('utf-8');
        let xml = "<stream:stream xmlns='jabber:client' to='koma-network.com' from = '6010002@koma-network.com' xmlns:stream='http://etherx.jabber.org/streams' version='1.0'>";
        client.write(xml);
        log(xml);
    }
    else if(jsonObj.hasOwnProperty('failure')){
        console.log(jsonObj);
    }
    else if(jsonObj.hasOwnProperty('iq')){

        counter = counter + 1;
        var packetId = prefixId + counter;

        if(jsonObj.iq.hasOwnProperty('bind')){            
            if(jsonObj.iq.bind.hasOwnProperty('jid')){
                console.log(jsonObj);

                let roster = {iq:{attr:{id:packetId,type:'get'},query:{attr:{xmlns:'jabber:iq:roster'}}}};
                let roster_xml = jsonToXml.parse(roster);
                client.write(roster_xml);
                log(roster_xml);
            }
        }
        else if(jsonObj.iq.hasOwnProperty('query')){

            if(jsonObj['iq'].query.attr.xmlns=='jabber:iq:roster'){
                console.log(jsonObj);
                let discoitem = {iq:{attr:{to:'iiot-club.com',id:packetId,type:'get'},query:{attr:{xmlns:'http://jabber.org/protocol/disco#items'}}}};
                let discoitem_xml = jsonToXml.parse(discoitem);
                client.write(discoitem_xml);
                log(discoitem_xml);
            }
            else if(jsonObj['iq'].query.attr.xmlns=='http://jabber.org/protocol/disco#items'){
                console.log(jsonObj);
                let vcard = {iq:{attr:{id:packetId,type:'get'},vCard:{attr:{xmlns:'vcard-temp'}}}};
                let vcard_xml = jsonToXml.parse(vcard);
                client.write(vcard_xml);
                log(vcard_xml);
            }
        }
        else if(jsonObj.iq.hasOwnProperty('vCard')){
            console.log(jsonObj);
            let sharedgroup = {iq:{attr:{id:packetId,type:'get'},sharedgroup:{attr:{xmlns:'http://www.jivesoftware.org/protocol/sharedgroup'}}}};
            let sharedgroup_xml = jsonToXml.parse(sharedgroup);
            client.write(sharedgroup_xml);
            log(sharedgroup_xml);
        }
        else if(jsonObj.iq.hasOwnProperty('sharedgroup')){
            console.log(jsonObj);
            let presence = {presence:{attr:{id:packetId},status:'Online',show:'available',priority:1}};
            let presence_xml = jsonToXml.parse(presence);
            client.write(presence_xml);
            log(presence_xml);
        }
        else{
            console.log(jsonObj);
        }
    }
    else if(jsonObj.hasOwnProperty('message')){
        console.log(jsonObj);
        if(jsonObj.message.hasOwnProperty('body')){
            let to = 'admin@koma-network.com';
            let jid = USERNAME+'@'+DOMAIN;        
            let msg = {message:{attr:{to:to,from:jid,id:packetId,type:'chat',protocol:'mqtt'},body:'haloooo juga',thread:packetId,x:{attr:{xmlns:'jabber:x:event'},offline:'',composing:''},active:{attr:{xmlns:'http://jabber.org/protocol/chatstates'}}}};
            let msg_xml = jsonToXml.parse(msg);
            client.write(msg_xml);
            log(msg_xml);
        }
    }
    else{
        console.log(jsonObj);
    }
});

client.on('close', function() {
    console.log("Connection closed");
    success = false;
});

client.on('error', function(error) {
    console.error(error);
    client.destroy();
    success = false;
});
