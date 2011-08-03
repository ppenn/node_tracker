var sys = require('sys'),
    mongoose = require("mongoose"),
    mongooseAuth = require('mongoose-auth'),
    crypto = require('crypto'),
    everyauth = require('everyauth'),
    io = require('socket.io'),
    json = JSON.stringify,
    log = sys.puts,
    clientManager = require('./javascripts/clientManager'),
    clientModel = require('./javascripts/client'),
    Location = clientModel.Location,
    connect = require('connect'),
    _u = require('underscore'),
    express = require('express'),
    server;

var UserSchema = new mongoose.Schema({
  locations: [Location]
}), User;
UserSchema.method("addLocation", function(loc){

  var num = this.locations.length,
      lastLocation = this.locations[num -1];

  if (num === 0){
    this.locations.push(loc);
    return true;
  } 

  // If it's the same location and we are within the hour, don't add it
 // FOr some reason, the types are not the same, so can't use === (should figgur dis out) 
  if ((lastLocation.latitude == loc.latitude) && 
    (lastLocation.longitude == loc.longitude) && 
    (loc.created_on - lastLocation.created_on < 3600000)) {
    
    console.log("*** returning false");
    return false;
  }
  this.locations.push(loc);
  console.log("*** returning true");
  return true;

});
UserSchema.plugin(mongooseAuth, {
  everymodule: {
    everyauth: {
      User: function() {
        return User;      
      }           
    }            
  }
  , password: { 
      loginWith: "email"
    , extraParams: {
      name: {
                first: String
              , last: String
            }
      }
    , everyauth: {
        getLoginPath: '/login' 
      , postLoginPath: '/login'
      , loginView: 'partials/login.jade'
      , loginLocals: {title: "Login"}
      , getRegisterPath: '/register'
      , postRegisterPath: '/register'
      , registerView: 'register.jade'
      , registerLocals: {title: "Register"}
      , loginSuccessRedirect: '/'
      , registerSuccessRedirect: '/'
      /*, respondToLoginSucceed: function(res, user) {
         if (user) {
            res.writeHead(303, {'Location': this.loginSuccessRedirect()});
            clientManager.addClient({id:user.id})
            res.end();
          }
      }*/
    }
  }
});



mongoose.model('User', UserSchema);
mongoose.connect('mongodb://localhost/node_tracker_test'),
User = mongoose.model('User');

server = express.createServer(
    connect.logger(),
    express.cookieParser(),
    express.bodyParser(),
    express.session({secret:"horseFart"}),
    connect.static(__dirname),
    mongooseAuth.middleware()
);
server.set('view engine', 'jade');
server.get('/', function(req, res) {
  res.render('index', { title: "Tracker"});
});

server.get('/clients', function(req,res){
  var json = {clients: []}; 
  _u.each(clientManager.getClients(), function(cli) {
    json.clients.push(JSON.parse(cli.toJson()));
  });
  res.send(json);
});

server.get('/crumbs', function(req, res) {

  res.send(req.user.locations);

});

server.listen(process.env.C9_PORT || process.env.PORT || 8000);
ws = io.listen(server);
function parse_cookies(_cookies) {
  var cookies = {};    
  _cookies && _cookies.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      cookies[ parts[ 0 ].trim() ] = ( parts[ 1 ] || '' ).trim();
  });    
  return cookies;
}
/// This isn't doing anything, but it could...
ws.configure(function () {
  function auth (data, fn) {
    console.dir(data);
    var cookies = parse_cookies(data.headers.cookie);
    console.log("**** auth");
    console.dir(cookies);        
    fn(null, true);
  };  
  ws.set('authorization', auth);
});

ws.sockets.on('connection', function(client){
  sendExistingClients(client);
  client.on('message', function(message) {
    log("* message = " + message);
    var request = JSON.parse(message.replace('<', '&lt;').replace('>', '&gt;'));
    User.find({id:message.id}, function(err, users) {
      var user = users[0], 
          json ={id:user.id, latitude: request.latitude, longitude: request.longitude, nickname: request.nickname};
      console.dir(user);
      clientManager.addClient(json);
      if (user.addLocation({ latitude: request.latitude, longitude: request.longitude, created_on: new Date()})) {
        user.save(function(err, user) {
          if (err) console.dir(err);
          else console.log('location added');
        } );
      }
      doSend(client, JSON.stringify(json), true);
    });
  });
  client.on('disconnect', function(){
    if (!everyauth.loggedIn) return;
    var nick = everyauth.user.first.name;
    log("client " + nick + " disconnected");
    doSend(client,json({'id': c_id, 'action': 'close', 'nickname': nick}), true);
  });

});
function sendExistingClients(client, callback) {
 console.log("New client, sending clients");
  var clis = clientManager.getClients();
  cli = 0;
  console.log("*** Current number of clients connected is " + clis.length);
  _u.each(clis, function(oldCli){
    if (oldCli.id !== client.id) {
      log('Sending ' + oldCli.id);
      console.dir(oldCli);
      oldCli.action = "position";
      doSend(client,JSON.stringify(oldCli), false);
    } else log('same id **');
  });
  if (callback) callback(client);
}

function doSend(client, message, broadcast){
  try {
    if (broadcast) {
      client.broadcast.send(message);
    } else {
      client.send(message);
    }
  } catch (e) {
    console.log("*** ERROR ***");
    console.dir(e);
  }

}

mongooseAuth.helpExpress(server);
exports.User = User;
