var http = require("http");
var url = require('url');
var fs = require("fs");
var socketio = require("socket.io");

var server = http.createServer(function(request,response){
	var path = url.parse(request.url).pathname;
	switch(path){
        case '/':
			response.writeHead(200, {'Content-Type': 'text/html',"X-Head": "Node-Server"});
            response.write('hello world');
			response.end();
            break;
        case '/testApp.html':
            fs.readFile('D:/webRtcProj/testApp.html', function(error, data){
                if(error !== null){
                    response.writeHead(404, {'Content-Type': 'text/html'});
                    response.write("read file opps this doesn't exist - 404");
                }else{
                    response.writeHead(200, {"Content-Type": "text/html","X-Head": "Node-Server"});
                    response.write(data, "utf8");
					response.end();
                }
            });
            break;
        default:
            response.writeHead(404, {'Content-Type': 'text/html'});
            response.write("opps this doesn't exist - 404");
			response.end();
            break;
    }
});

server.listen(8888);

var io = socketio.listen(server);

io.sockets.on("connection", function(socket){
	console.log("IO connection");
	socket.emit('handshake',{message : "Connection established"});
});

console.log("Node server is running.");

