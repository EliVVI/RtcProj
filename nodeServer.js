var http = require("http");
var url = require('url');
var fs = require("fs");
var socketio = require("socket.io");
var serverRoot = "D:/webRtcProj";
var defaultFile = "index.html";
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
	
	/*switch(path){
        case '/':
			response.writeHead(200, {'Content-Type': 'text/html'});
            response.write('hello world');
			response.end();
            break;
        case '/testApp.html':
            fs.readFile(serverRoot + '/testApp.html', function(error, data){
                if(error !== null){
                    response.writeHead(404, {'Content-Type': 'text/html'});
                    response.write("read file opps this doesn't exist - 404");
                }else{
                    response.writeHead(200, {"Content-Type": "text/html"});
                    response.write(data, "utf8");
					response.end();
                }
            });
            break;
        default:
			//console.log("cannot provide file " + path);
            response.writeHead(404, {'Content-Type': 'text/html'});
            response.write("opps this doesn't exist - 404");
			response.end();
            break;
    }*/
});

server.listen(8888);

var io = socketio.listen(server);

io.sockets.on("connection", function(client){
	//Генерируем идентификатор клиента
	var clientCurrentGuid = guid();
	var clientCurrentNodeId = client.id
	__clientsSessions[currentRequest["NODESESSID"]]["CLIENTCURRENTGUID"] = clientCurrentGuid;
	__clientsSessions[currentRequest["NODESESSID"]]["CLIENTCURRENTNODEID"] = clientCurrentNodeId;
	
	console.log(__clientsSessions);
	
	//Клиент подсоединился
	console.log("IO connection");
	//Посылаем уведомление об успешном подсоединении
	client.emit('handshake', {message : "Connection established", guid : clientCurrentGuid});
	//Обработчик, принимающий SDP
	client.on('takeSDP', function(message){
		var messageParsed = JSON.parse(message);
	});
});

console.log("Node server is running.");