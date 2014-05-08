var http = require("http");
var socket = require("socket.io");
var fs = require("fs");

var server = http.createServer();

var io =  socket.listen(server);

io.listen(8888);