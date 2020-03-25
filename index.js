const TransactionManager = require("transaction-manager");
const Room		 = require("./lib/Room");
//Get Semantic SDP objects
const SemanticSDP	= require("semantic-sdp");
const SDPInfo		= SemanticSDP.SDPInfo;

const PORT = 8084;

//HTTP&WS stuff
const http = require ('http');
const url = require ('url');
const fs = require ('fs');
const path = require ('path');
const WebSocketServer = require ('websocket').server;

//Get the Medooze Media Server interface
const MediaServer = require("medooze-media-server");

//Enable debug
MediaServer.enableDebug(false);
MediaServer.enableUltraDebug(false);
MediaServer.setPortRange(32400, 32900);

//Check 
if (process.argv.length!=3)
	 throw new Error("Missing IP address\nUsage: node index.js <ip>"+process.argv.length);
//Get ip
const ip = process.argv[2];

//The list of sport castings
const rooms = new Map();

const base = 'www';

// maps file extention to MIME typere
const map = {
	'.ico': 'image/x-icon',
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.wav': 'audio/wav',
	'.mp3': 'audio/mpeg',
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
	'.doc': 'application/msword'
};


//Create HTTP server
const server = http.createServer ((req, res) => {
	// parse URL
	const parsedUrl = url.parse (req.url);
	// extract URL path
	let pathname = base + parsedUrl.pathname;
	// based on the URL path, extract the file extention. e.g. .js, .doc, ...
	const ext = path.parse (pathname).ext;

	//DO static file handling
	fs.exists (pathname, (exist) => {
		if (!exist)
		{
			// if the file is not found, return 404
			res.statusCode = 404;
			res.end (`File ${pathname} not found!`);
			return;
		}

		// if is a directory search for index file matching the extention
		if (fs.statSync (pathname).isDirectory ())
			pathname += '/index.html';

		// read file from file system
		fs.readFile (pathname, (err, data) => {
			if (err)
			{
				//Error
				res.statusCode = 500;
				res.end (`Error getting the file: ${err}.`);
			} else {
				// if the file is found, set Content-type and send data
				res.setHeader ('Content-type', map[ext] || 'text/html');
				res.end (data);
			}
		});
	});
}).listen (PORT);

//Create ws server
const ws = new WebSocketServer ({
	httpServer: server,
	autoAcceptConnections: false
});

//Listen for requests
ws.on ('request', (request) => {
	// parse URL
	const url = request.resourceURL;
	
	
	//Find the room id
	let updateParticipants;
	let participant;
	let room = rooms.get(url.query.id);
	
	//if not found
	if (!room) 
	{
		//Create new Room
		room = new Room(url.query.id,ip);
		//Append to room list
		rooms.set(room.getId(), room);
	}
	
	//Get protocol
	var protocol = request.requestedProtocols[0];
	
	//Accept the connection
	const connection = request.accept(protocol);
	
	//Create new transaction manager
	const tm = new TransactionManager(connection);

	//Handle incoming commands
	tm.on("cmd", async function(cmd) 
	{
		//Get command data
		const data = cmd.data;
		//check command type
		switch(cmd.name)
		{
			case "join":
				try {
					//Check if we already have a participant
					if (participant)
						return cmd.reject("Already joined");

					//Create it
					participant = room.createParticipant(data.name);
					
					//Check
					if (!participant)
						return cmd.reject("Error creating participant");

					//Add listener
					room.on("participants",(updateParticipants = (participants) => {
						console.log("room::participants");
						tm.event("participants", participants);
					}));
					
					//Process the sdp
					const sdp = SDPInfo.process(data.sdp);
		
					//Get all streams before adding us
					const streams = room.getStreams();
					
					//Init participant
					participant.init(sdp);
					
					//For each one
					for (let stream of streams)
						//Add it
						participant.addStream(stream);
					
					//Get answer
					const answer = participant.getLocalSDP();

					//Accept cmd
					cmd.accept({
						sdp	: answer.toString(),
						room	: room.getInfo()
					});
					
					//For all remote streams
					for (let stream of sdp.getStreams().values())
						//Publish them
						participant.publishStream(stream);
					
					participant.on("renegotiationneeded",(sdp) => {
						console.log("participant::renegotiationneeded");
						//Send update event
						tm.event('update',{
							sdp	: sdp.toString()
						});
					});
					
					//listen for participant events
					participant.on("closed",function(){
						//close ws
						connection.close();
						//Remove room listeners
						room.off("participants",updateParticipants);
					});
					
				} catch (error) {
					console.error(error);
					//Error
					cmd.reject({
						error: error
					});
				}
				break;
		}
	});

	connection.on("close", function(){
		console.log("connection:onclose");
		//Check if we had a participant
		if (participant)
			//remove it
			participant.stop();
	});
});
