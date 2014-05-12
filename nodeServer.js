var http = require("http");
var url = require('url');
var fs = require("fs");
var socketio = require("socket.io");
var serverRoot = "D:/webRtcProj";
var defaultFile = "index.html";
var __clientsID = [];

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

//Совместно с временем используются для генерации уникального id клиента
var symbols = [
	"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
	"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
]

//Выделяем mime а заоднопроверяем. поддерживаем его или нет
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

//Генератор уникального идентификатора клиента
function generateClientID(){
	var time = new Date().getTime();
	var randomString = "";
	for(var i = 0; i < 10; i++){
		randomString += symbols[Math.floor(Math.random( ) * (52 + 1))];
	}
	return (time + randomString);
}

//Создаём сервер
var server = http.createServer(function(request,response){
	var path = url.parse(request.url).pathname;
	
	var pathCombined = combinePath(path);

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
	var clientId = generateClientID();
	__clientsID.push(clientId);
	//Клиент подсоединился
	console.log("IO connection");
	//Посылаем уведомление об успешном подсоединении
	client.emit('handshake', {message : "Connection established", id : clientId});
	//Обработчик, принимающий SDP
	client.on('takeSDP', function(message){
		var messageParsed = JSON.parse(message);
		console.log(messageParsed.sdp);
	});
});

console.log("Node server is running.");

