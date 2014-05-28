var http = require("http");
var dgram = require('dgram');
var bncode = require('bncode');
var compact2string = require('compact2string')
var url = require('url');
var hat = require('hat');
var fs = require("fs");
var socketio = require("socket.io");
var readTorrentFile = require("read-torrent");
var xmlHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var serverRoot = __dirname;
var defaultPage = "index.html";
var __clientsSessions = {};
var currentRequest = "";

//Список поддерживаемых mime-типов
var mimes = {
	js : "appication/javascript",
	html : "text/html",
	css : "text/css",
	gif : "image/gif",
	png : "image/png",
	jpeg : "image/jpeg",
	jpg : "image/jpg",
}

function S4(){
	return (((1 + Math.random()) * 0x10000)|0).toString(16).substring(1);
}

//Генератор уникального id
function guid() {
   return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

//Генерация уникального NODESESSID
function generateNodeSessId(){
	var pool = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	var newId = "";
	for(var i = 0; i < 26; i++){
		var r = Math.floor(Math.random() * pool.length);
		newId += pool.charAt(r);
	}
	return newId;
}

function getUserListCurrentId(){
	var auxArray = [];
	for(var nodeIds in __clientsSessions){
		auxArray.push(__clientsSessions[nodeIds]["curentnodeid"]);
	}
	return auxArray;
}

//Извлеч куки.
//Передаётся объект request
function getUserCookie(request){
	var cookie = {};
	if(request.headers.cookie){
		var cookies = request.headers.cookie.split(";");
		var cookiesArrayCounter = cookies.length;
		for(var i = 0; i < cookiesArrayCounter; i++){
			var pair = cookies[i].split("=");
			cookie[pair[0]] = pair[1];
		}
	}
	return cookie;
}

//Создать массив куков для передачи в заголовок
function makeCookieArray(cookieNameToValueArray){
	var cookies = [];
	for(var i in cookieNameToValueArray){
		cookies.push(i + "=" + cookieNameToValueArray[i]);
	}
	return cookies;
}

//Инициализировать сессию
function initUserSession(request){
	var NODESESSID = "";
	var userCookie = getUserCookie(request);
	if((typeof userCookie["NODESESSID"]) === "undefined"){
		NODESESSID = generateNodeSessId();
		__clientsSessions[NODESESSID] = {};
	}else{
		NODESESSID = userCookie["NODESESSID"];
		if((typeof __clientsSessions[NODESESSID]) === "undefined"){
			__clientsSessions[NODESESSID] = {};
		}
	}
	return NODESESSID;
}

//Получить объект сессии
function getUserSessionVariables(nodesessid){
	return __clientsSessions[nodesessid];
}

//Выделяем mime а заодно проверяем, поддерживаем его или нет
function checkMime(path, mimesSupported){
	var lastIndex = path.lastIndexOf(".");
	var mime = path.substring(lastIndex + 1, path.length);
	if(mimesSupported[mime] !== undefined){
		return mimesSupported[mime];
	}else{
		return "undefined-mime/unedfined";
	}
}

//Преобразуем путь, раскрывая . и ..
function combinePath(path){
	if(path === "/")
		return "/";
	var pathParts = path.split("/");
	var pathPartsCleared = [];
	for(var part in pathParts){
		if(pathParts[part] !== ""){	
			switch(pathParts[part]){
				case "..":
					pathPartsCleared.pop()
					break
				case ".":
					continue
					break
				default:
					pathPartsCleared.push(pathParts[part])
					break
			}
		}	
	}

	var file = pathPartsCleared.pop();
	var path = "/" + pathPartsCleared.join("/") + "/" + file;
	return path;
}

//Создаём сервер
var server = http.createServer(function(request, response){
	var path = url.parse(request.url).pathname;
	var pathCombined = combinePath(path);
	
	var userSessId = initUserSession(request);
	var userCookie = getUserCookie(request);
	
	userCookie["NODESESSID"] = userSessId;
	currentRequest = userCookie;
	
	response.setHeader("Set-Cookie", makeCookieArray(userCookie));
	
	fs.readFile(serverRoot + pathCombined, function(error, data){
		if(error !== null){
			fs.readFile(serverRoot + pathCombined + "/index.html", function(error, data){
				if(error !== null){
					console.log("cannot provide file " + pathCombined);
					response.writeHead(404, {'Content-Type': 'text/html'});
                    response.write("read file opps this doesn't exist - 404");
					response.end();
				}else{
					response.writeHead(200, {"Content-Type": "text/html"});
					response.write(data, "utf8");
					response.end();
				}
			})
		}else{
			var mime = checkMime(pathCombined, mimes);
			response.writeHead(200, {"Content-Type": mime});
            response.write(data, "utf8");
			response.end();
		}
	})
});

server.listen(8888);

var io = socketio.listen(server);

io.sockets.on("connection", function(client){
	//Генерируем идентификатор клиента
	var clientCurrentGuid = guid();
	var clientCurrentNodeId = client.id
	
	//Так как сессии хранятся в глобальном объекте, то при рестарте сервера они теряются.
	//Клиент продолжает посылать запросы через сокет но это идет в обход сервера
	//Т.к сесия при этом заново не создаётся (она создаётся только сервером), то код
	//__clientsSessions[currentRequest["NODESESSID"]]["curentguid"] = clientCurrentGuid; генерирует ошибку
	//Мы пытаемся присвоить значение несуществующему объекту
	if(currentRequest !== "" && __clientsSessions[currentRequest["NODESESSID"]] !== "undefined"){
		__clientsSessions[currentRequest["NODESESSID"]]["curentguid"] = clientCurrentGuid;
		__clientsSessions[currentRequest["NODESESSID"]]["curentnodeid"] = clientCurrentNodeId;
	}else{
		//В случае потери сесии послать сигнал reconnect
		//На самом деле реконнекта не будет, для этого надо перезагрузить страницу, мы могли бы это сделать автоматически
		//Но лучше выдать предупреждение пользователю об истечении сессии, чтобы он сохранил нужные данные
		client.emit("reconnect", {message : "session is out"})
	}
	
	//Клиент подсоединился
	console.log("IO connection");
	
	//Посылаем уведомление об успешном подсоединении
	client.emit("handshake", {message : "Connection established", clientCurrentNodeId : clientCurrentNodeId});
	
	//Обработчик, принимающий SDP
	client.on("takeSDP", function(message){
		var messageParsed = JSON.parse(message);
		//Рассылаем штроковещательный запрос на добавление нашего оффера
		//Пока рассылается широковещательно, потом надо сделать выборочно по наличию файла
		io.sockets.emit("takeRemoteSdp", {data : message, id : client.id});
	});
	
	//Обмен ICE-серверами
	client.on("ice", function(message){
		//Рассылка ICE-серверов
		io.sockets.emit("takeIce", {data : message, id : client.id});
	});
	
	//Сохраняем параметры оффера
	client.on("saveRtcInfo", function(message){
		var parcedMessage = JSON.parse(message);
		__clientsSessions[currentRequest["NODESESSID"]]["sdp"] = message;
	});
	
	//Выбираем с каким пользователем хотим установить связь
	client.on("userToConnect", function(msg){
		console.log("wantconnect");
		var params = JSON.parse(msg);
		var paramsSdp = "";
		for(var nodeid in __clientsSessions){
			if(params.me === __clientsSessions[nodeid]["curentnodeid"])
				paramsSdp = __clientsSessions[nodeid]["sdp"];
		}
		io.sockets.emit("wantToConnect", JSON.stringify({clientid : params.remoteId, param : paramsSdp, from : params.me}));
	});
	
	//Дисконнект
	client.on('disconnect', function(){
		console.log('client disconnected');
		var auxArray = [];
		for(var nodeIds in __clientsSessions){
			if(__clientsSessions[nodeIds]["curentnodeid"] === client.id){
				delete __clientsSessions[nodeIds];
				aliveUsers();
				break;
			}
		}
	});
	
	//Посылаем ответ от ответчика
	client.on("remoteAnswer", function(msg){
		io.sockets.emit("takeAnswer", msg);
	});
	
	//Посылаем список пользователей
	aliveUsers();
});

function aliveUsers(){
	io.sockets.emit("aliveUsers", JSON.stringify(getUserListCurrentId()));
}

setInterval(aliveUsers, 10000);

console.log("Node server is running.");







readTorrentFile("D:/webRtcProj/files/Sahara.torrent", function(a, data){
	var fileInfo = {};
	//Список анонсеров в виде массива
	fileInfo.announce = data.announce;
	//Хэш для передачи анонсеру
	fileInfo.infoHash = data.infoHash;
	//Размер файла
	fileInfo.length = data.length;
	//Список словарей по всем файлам
	fileInfo.files = data.files;
	//Длинна одного куска
	fileInfo.pieceLength = data.pieceLength;
	//Хэши всех кусков
	fileInfo.pieces = data.pieces;
	
	function log(response){
		console.log(response);
	}
	
	var ajaxPool = [];
	
	fs.writeFile("D:/webRtcProj/files/Sahara.txt", JSON.stringify(data));
	//var url = "info_hash=" + fileInfo.infoHash + "&peer_id=-UT2000-1234567890AB&port=55505&uploaded=0&downloaded=0&left=0&compact=0&no_peer_id=0&event=started";
	
	/*ajaxPool.push(new xmlHttpRequest());
	ajaxPool[0].open("GET", _url, true);
	ajaxPool[0].onreadystatechange = function(){
		log(this.responseText);
		if(this.readyState == 4){
			if(this.status == 200){
				log(this.responseText);
			}else{
				console.log("error");
			}
		}
	};
	ajaxPool[0].send();*/
	
	for(var i = 0; i < fileInfo.announce.length; i++){
		var url = fileInfo.announce[i] + "?" + "info_hash=" + encodeURIComponent(fileInfo.infoHash) + "&peer_id=-UT2000-1234567890AB&port=5251&key=E9FD577A&uploaded=0&downloaded=0&left=0&compact=1&no_peer_id=0&event=started";
		if(/^udp:/.test(fileInfo.announce[i])){
			requestUdp(url, fileInfo);
		}
		if(/^http:/.test(fileInfo.announce[i])){
			requestHttp(url, fileInfo);
		}
	}
});


//
// HELPERS
//

function toUInt16(n){
	var buf = new Buffer(2);
	buf.writeUInt16BE(n, 0);
	return buf;
}

function toUInt32(n){
	var buf = new Buffer(4);
	buf.writeUInt32BE(n, 0);
	return buf;
}

function toUInt64(n){
	if(typeof bignum === 'function'){
		return bignum(n).toBuffer({ size: 8 });
	}else{
		// optional compiled dependency 'bignum' is not available, so round down to MAX_UINT.
		// These values are only used for tracker stats anyway.
		if(n > MAX_UINT){
			n = MAX_UINT;
		}
		return Buffer.concat([toUInt32(0), toUInt32(n)]);
	}
}

function bytewiseEncodeURIComponent(buf){
	return encodeURIComponent(buf.toString('binary'));
}

function bytewiseDecodeURIComponent(str){
	return new Buffer(decodeURIComponent(str), 'binary');
}



var CONNECTION_ID = Buffer.concat([toUInt32(0x417), toUInt32(0x27101980)]);
var ACTIONS = {CONNECT: 0, ANNOUNCE: 1, SCRAPE: 2, ERROR: 3};
var EVENTS = {update: 0, completed: 1, started: 2, stopped: 3};
var MAX_UINT = 4294967295;
var REMOVE_IPV6_RE = /^::ffff:/;



function handleResponse(requestUrl, data){
	try{
		data = bncode.decode(data);
	}catch(err){
		console.log( new Error('Error decoding tracker response: ' + err.message));
	}
	
	var failure = data['failure reason'];
	if(failure){
		console.log(new Error(failure));
	}

	var warning = data['warning message'];
	if(warning){
		console.log(warning);
	}

	/*if(requestUrl === self._announceUrl){
		var interval = data.interval || data['min interval'];
		if (interval && !self._opts.interval && self._intervalMs !== 0) {
			// use the interval the tracker recommends, UNLESS the user manually specifies an
			// interval they want to use
			self.setInterval(interval * 1000);
		}

		var trackerId = data['tracker id'];
		if(trackerId){
			// If absent, do not discard previous trackerId value
			self._trackerId = trackerId;
		}

		self.client.emit('update', {
			announce: self._announceUrl,
			complete: data.complete,
			incomplete: data.incomplete
		})

		if(Buffer.isBuffer(data.peers)){
			// tracker returned compact response
			compact2string.multi(data.peers).forEach(function (addr) {
				self.client.emit('peer', addr)
			})
		}else if(Array.isArray(data.peers)){
			// tracker returned normal response
			data.peers.forEach(function(peer){
				var ip = peer.ip;
				self.client.emit('peer', ip[0] + '.' + ip[1] + '.' + ip[2] + '.' + ip[3] + ':' + peer.port);
			})
		}
	}else if(requestUrl === self._scrapeUrl){
		// NOTE: the unofficial spec says to use the 'files' key but i've seen 'host' in practice
		data = data.files || data.host || {};
		data = data[bytewiseEncodeURIComponent(self.client._infoHash)];

		if(!data){
			self.client.emit('error', new Error('invalid scrape response'));
		}else{
			// TODO: optionally handle data.flags.min_request_interval (separate from announce interval)
			self.client.emit('scrape', {
				announce: self._announceUrl,
				complete: data.complete,
				incomplete: data.incomplete,
				downloaded: data.downloaded
			})
		}
	}*/
}

function requestHttp(requestUrl, opts){
	var opts = opts || {};
	var req = http.get(requestUrl, function(res){
		if(res.statusCode !== 200){
			res.resume(); // consume the whole stream
			console.log(new Error('Invalid response code ' + res.statusCode + ' from tracker ' + requestUrl));
			return;
		}
		res.pipe(concat(function(data){
			if(data && data.length) handleResponse(requestUrl, data);
		}))
	})

	req.on('error', function(err){
		console.log(err);
	})
}


function requestUdp(requestUrl, opts){
	var opts = opts || {};
	var parsedUrl = url.parse(requestUrl);
	var socket = dgram.createSocket('udp4');
	var transactionId = new Buffer(hat(32), 'hex');
	
	var _interval, _intervalMs, _scrapeUrl;
	
	function setInterval(intervalMs){
		if(_interval){
			clearInterval(_interval);
		}

		_intervalMs = intervalMs;
		if(_intervalMs){
			_interval = setInterval(update, _intervalMs)
		}
	}
	
	/*function start(opts){
		opts = opts || {};
		opts.event = 'started';
		self._request(opts);

		setInterval(_intervalMs); // start announcing on intervals
	}*/

	/*function stop(opts){
		opts = opts || {};
		opts.event = 'stopped';
		self._request(opts);

		setInterval(0); // stop announcing on intervals
	}*/

	/*function complete(opts){
	  opts = opts || {};
	  opts.event = 'completed';
	  opts.downloaded = opts.downloaded || self.torrentLength || 0;
	  self._request(opts);
	}*/

	/*function update(opts){
		opts = opts || {};
		self._request(opts);
	}*/

	/*function scrape(opts){
		if(!_scrapeUrl){
			var announce = 'announce';
			var i = _announceUrl.lastIndexOf('/') + 1;

			if(i >= 1 && _announceUrl.slice(i, i + announce.length) === announce){
				_scrapeUrl = _announceUrl.slice(0, i) + 'scrape' + _announceUrl.slice(i + announce.length);
			}
		}

		if(_scrapeUrl){
			console.log(new Error('scrape not supported for announceUrl ' + self._announceUrl));
			return;
		}

		opts = extend({
			info_hash: bytewiseEncodeURIComponent(self.client._infoHash)
		}, opts)

		_requestImpl(_scrapeUrl, opts);
	}*/

	if(opts.event !== 'stopped'){
		// if we're sending a stopped message, we don't really care if it arrives, so don't
		// set a timer
		var timeout = setTimeout(function(){
			timeout = null;
			cleanup();
			error('tracker request timed out');
		}, 15000)
	}

	/*if (timeout && timeout.unref) {
		timeout.unref();
	}*/
	
	send(Buffer.concat([
		CONNECTION_ID,
		toUInt32(ACTIONS.CONNECT),
		transactionId
	]))

	socket.on('error', error);

	socket.on('message', function(msg, rinfo){
		if(msg.length < 8 || msg.readUInt32BE(4) !== transactionId.readUInt32BE(0)){
			return error('tracker sent back invalid transaction id');
		}
		
		var action = msg.readUInt32BE(0);
		
		switch(action){
			case 0: // handshake
				console.log("handshake");
				if(msg.length < 16){
					return error('invalid udp handshake');
				}

				var scrapeStr = 'scrape';
				if(requestUrl.substr(requestUrl.lastIndexOf('/') + 1, scrapeStr.length) === scrapeStr){
					scrape(msg.slice(8, 16), opts);
				}else{
					announce(msg.slice(8, 16), opts);
				}
				return;

			case 1: // announce
				console.log("announce");
				console.log(msg.readUInt32BE(16));
				cleanup();
				if(msg.length < 20){
					return error('invalid announce message');
				}

				var interval = msg.readUInt32BE(8);
				if (interval && opts.interval) {
					// use the interval the tracker recommends, UNLESS the user manually specifies an
					// interval they want to use
					setInterval(interval * 1000);
				}

				/*update({
					announce: self._announceUrl,
					complete: msg.readUInt32BE(16),
					incomplete: msg.readUInt32BE(12)
				})*/

				compact2string.multi(msg.slice(20)).forEach(function(addr){
					console.log('peer', addr);
				})
				break

			case 2: // scrape
				console.log("scrape");
				cleanup();/*
				if(msg.length < 20){
					return error('invalid scrape message');
				}
				scrape({
					announce: self._announceUrl,
					complete: msg.readUInt32BE(8),
					downloaded: msg.readUInt32BE(12),
					incomplete: msg.readUInt32BE(16)
				})*/
				break

			case 3: // error
				cleanup();
				console.log("error");
				if(msg.length < 8){
					return error('invalid error message')
				}
				console.log(new Error(msg.slice(8).toString()));
				break
		}
	})

	function send(message){
		if(!parsedUrl.port){
			parsedUrl.port = 80;
		}
		socket.send(message, 0, message.length, parsedUrl.port, parsedUrl.hostname)
	}

	function error(message){
		console.log(new Error(message + ' (connecting to tracker ' + requestUrl + ')'));
		cleanup();
	}

	function cleanup(){
		if(timeout){
			clearTimeout(timeout);
			timeout = null;
		}
		try{ 
			socket.close();
		}catch(err){
		}
	}

	function genTransactionId(){
		transactionId = new Buffer(hat(32), 'hex');
	}

	function announce(connectionId, opts){
		opts = opts || {}
		genTransactionId()
		send(Buffer.concat([
			connectionId,
			toUInt32(ACTIONS.ANNOUNCE),
			transactionId,
			Buffer.isBuffer(opts.infoHash) ? opts.infoHash : new Buffer(opts.infoHash, 'hex'),
			new Buffer("-UT2000-1234567890AB", "utf8"),
			toUInt64(opts.downloaded || 0),
			opts.left ? toUInt64(opts.left) : new Buffer('FFFFFFFFFFFFFFFF', 'hex'),
			toUInt64(opts.uploaded || 0),
			toUInt32(EVENTS[opts.event] || 0),
			toUInt32(0), // ip address (optional)
			toUInt32(0), // key (optional)
			toUInt32(50),
			toUInt16(0)
		]))
	}

	function scrape(connectionId, opts){
		genTransactionId();
		send(Buffer.concat([
			connectionId,
			toUInt32(ACTIONS.SCRAPE),
			transactionId,
			Buffer.isBuffer(opts.infoHash) ? opts.infoHash : new Buffer(opts.infoHash, 'hex'),
		]))
	}
}